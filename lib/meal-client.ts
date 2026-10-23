import type {Auth} from 'firebase/auth';
import {collection,doc,getDoc,getDocs,query,where,orderBy,limit,runTransaction,writeBatch,serverTimestamp,Timestamp,type Firestore} from 'firebase/firestore';
import {ensureUser,firebaseClient} from './firebase-client';
import {cleanName,isLocked,mealDays,nameId,publicWorkspace,selectMealDay,validDate,validateMenu} from './meal-client-model';
import type {Day,Order,Workspace} from './types';
import {mealSession,type StatisticsOrder} from './statistics';
import {ownAccess,syncUserProfile} from './user-management';
import {rememberOrderName} from './order-name';

export class MealClient{
 constructor(public auth:Auth,public db:Firestore,private source:Workspace){}
 async isAdmin(){const u=await ensureUser(this.auth);if(u.isAnonymous)return false;const token=await u.getIdTokenResult();if(token.claims.email_verified!==true||token.signInProvider!=='google.com')return false;const s=await getDoc(doc(this.db,'admins',u.uid));return s.data()?.enabled===true;}
 async statistics(){
  const user=await ensureUser(this.auth);
  const days=await getDocs(collection(this.db,'days'));
  const records:StatisticsOrder[]=[];
  for(let i=0;i<days.docs.length;i+=6){
   const groups=await Promise.all(days.docs.slice(i,i+6).map(async day=>{
    const data=day.data();if(!validDate(data.date))throw new Error('Có ngày đặt cơm chưa hợp lệ. Vui lòng kiểm tra lại.');
    const ref=collection(this.db,'days',day.id,'orders');
    const orders=await getDocs(ref);
    return orders.docs.filter(o=>!o.data().cancelled).map(o=>{
     const value=o.data(),amount=value.price*value.quantity;
     if(!Number.isSafeInteger(amount)||amount<=0||typeof value.paid!=='boolean')throw new Error('Có đơn chưa đủ thông tin số tiền hoặc thanh toán.');
     return {id:'web:'+day.id+':'+o.id,dayId:day.id,date:data.date,session:mealSession(data.label||''),name:value.name,dish:value.dish,quantity:value.quantity,amount,paid:value.paid,source:'web' as const};
    });
   }));
   for(const group of groups)records.push(...group);
  }
  if(this.auth.currentUser?.uid!==user.uid)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại.');
  return records;
 }
 async read(dayId?:string){
  const user=await ensureUser(this.auth);
  const [admin,daysSnapshot,payment,blocked]=await Promise.all([this.isAdmin(),getDocs(query(collection(this.db,'days'),orderBy('date','desc'),limit(366))),getDoc(doc(this.db,'settings','payment')),ownAccess(this)]);
  const days=new Map(this.source.days.map(d=>[d.id,d]));
  for(const d of daysSnapshot.docs){const data=d.data();days.set(d.id,{id:d.id,date:data.date,label:data.label,menu:[],menuCount:data.menuCount,source:false,status:data.status});}
  const now=new Date(),list=mealDays([...days.values()],now);
  for(const d of list)days.set(d.id,d);
  const selected=selectMealDay(list,dayId,now);
  const published=daysSnapshot.docs.some(d=>d.id===selected.id);
  let day=selected,orders:Order[]=[];
  if(published){
   const ordersRef=collection(this.db,'days',day.id,'orders');
   const [menu,orderSnapshot]=await Promise.all([getDocs(query(collection(this.db,'days',day.id,'dishes'),where('active','==',true))),getDocs(ordersRef)]);
   day={...day,menu:menu.docs.map(d=>({name:d.data().name as string,price:d.data().price as number}))};days.set(day.id,day);
   orders=orderSnapshot.docs.filter(d=>!d.data().cancelled).map(d=>{const o=d.data();return {id:d.id,dayId:day.id,name:o.name,dish:o.dish,price:o.price,quantity:o.quantity,note:o.note,paid:o.paid,cancelled:o.cancelled,actor:o.ownerId,updatedAt:o.updatedAt?.toDate().toISOString()||'',canEdit:admin||o.ownerId===user.uid};});
  }
  const qr=payment.data()?.qrUrl;
  return {...this.source,days:[...days.values()].sort((a,b)=>b.date.localeCompare(a.date)),day,orders,members:[],admin,userId:user.uid,locked:isLocked(day),blocked,signedIn:!user.isAnonymous,displayName:user.displayName||user.email||'Khách',storageReady:published,paymentAvailable:typeof qr==='string'&&!!qr,paymentUrl:typeof qr==='string'?qr:''};
 }
 async write(body:Record<string,unknown>){
  const user=await ensureUser(this.auth),admin=await this.isAdmin();
  if(body.action==='order'&&await ownAccess(this))throw new Error('Tài khoản này đang tạm khóa đặt cơm. Vui lòng liên hệ quản trị viên.');
  const id=body.action==='day'&&body.create?`day-${String(body.date)}`:String(body.dayId||'');
  if(!/^[\w-]{1,100}$/.test(id))throw new Error('Không tìm thấy ngày đặt cơm.');
  if(body.action==='day'){
   if(!admin)throw new Error('Chỉ người quản lý được sửa thực đơn.');
   const current=await getDoc(doc(this.db,'days',id)),fallback=this.source.days.find(d=>d.id===id);
   if(body.create&&current.exists())throw new Error('Ngày này đã có thực đơn.');
   const date=String(body.date||current.data()?.date||fallback?.date||''),status=String(body.status||'auto');
   if(!validDate(date)||!['auto','open','closed'].includes(status))throw new Error('Ngày hoặc trạng thái không hợp lệ.');
   const menu=validateMenu(body.menu),old=current.exists()?(await getDocs(collection(this.db,'days',id,'dishes'))).docs:[];
   const dishes=await Promise.all(menu.map(async m=>({...m,id:await nameId(m.name)}))),active=new Set(dishes.map(m=>m.id));
   const batch=writeBatch(this.db);batch.set(doc(this.db,'days',id),{date,label:current.data()?.label||fallback?.label||`${Number(date.slice(8))}/${Number(date.slice(5,7))}`,status,menuCount:menu.length,cutoffAt:Timestamp.fromDate(new Date(date+'T09:30:00+07:00')),updatedAt:serverTimestamp()});
   for(const d of old)if(!active.has(d.id))batch.update(d.ref,{active:false,updatedAt:serverTimestamp()});
   for(const d of dishes)batch.set(doc(this.db,'days',id,'dishes',d.id),{name:d.name,price:d.price,active:true,updatedAt:serverTimestamp()});
   await batch.commit();return this.read(id);
  }
  const name=cleanName(body.name),orderId=String(body.id||await nameId(name)),orderRef=doc(this.db,'days',id,'orders',orderId);
  let savedName:string|undefined;
  try{savedName=await runTransaction(this.db,async tx=>{
   const [daySnapshot,existing]=await Promise.all([tx.get(doc(this.db,'days',id)),tx.get(orderRef)]);
   if(!daySnapshot.exists())throw new Error('Thực đơn chưa được người quản lý đăng.');
   const config=daySnapshot.data(),old=existing.data();
   if(old&&old.ownerId!==user.uid&&!admin)throw new Error('Bạn chỉ được sửa đơn của mình.');
   if(body.action==='paid'){
    if(!admin||!existing.exists())throw new Error('Chỉ người quản lý được xác nhận thanh toán.');
    tx.update(orderRef,{paid:body.paid===true,updatedAt:serverTimestamp()});return;
   }
   if(isLocked({id,date:config.date,label:config.label,status:config.status,menu:[],source:false}))throw new Error('Đã chốt cơm. Cần mở lại ngày trước khi thay đổi đơn.');
   if(body.action==='cancel'){
    if(!existing.exists())throw new Error('Không tìm thấy đơn cơm.');tx.update(orderRef,{cancelled:true,paid:false,updatedAt:serverTimestamp()});return;
   }
   if(body.action!=='order')throw new Error('Thao tác không hợp lệ.');
   const dishName=cleanName(body.dish),dishId=await nameId(dishName),dish=await tx.get(doc(this.db,'days',id,'dishes',dishId));
   const quantity=Number(body.quantity??1),note=String(body.note||'').trim();
   if(!name||name.length>100||note.length>300||!Number.isInteger(quantity)||quantity<1||quantity>30||!dish.exists()||!dish.data().active)throw new Error('Kiểm tra tên, món, số lượng (1–30) và ghi chú (tối đa 300 ký tự).');
   const price=old?.dishId===dishId?old.price:dish.data().price;
   const paid=old&&!old.cancelled&&old.dishId===dishId&&old.quantity===quantity&&old.price===price?old.paid:false;
   tx.set(orderRef,{name:old?.name||name,dish:dish.data().name,dishId,price,quantity,note,paid,cancelled:false,ownerId:old?.ownerId||user.uid,createdAt:old?.createdAt||serverTimestamp(),updatedAt:serverTimestamp()});
   return !old||old.ownerId===user.uid?old?.name||name:undefined;
  });}catch(error){if((error as {code?:string}).code==='permission-denied'&&!body.id&&body.action==='order')throw new Error('Tên này đã có đơn trong ngày, hoặc chưa được cấp quyền đặt cơm. Hãy sửa đơn cũ hoặc liên hệ người gom cơm.');throw error;}
  if(savedName){rememberOrderName(savedName);await syncUserProfile(this,savedName).catch(()=>{});}
  return this.read(id);
 }
}
let instance:MealClient|undefined;
export function mealClient(source:Workspace){const {auth,db}=firebaseClient();return instance??=new MealClient(auth,db,source);}
