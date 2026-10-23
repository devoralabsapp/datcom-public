import {appendActivity,orderAudit} from './activity';
import {orderFinance,moneyFields,financiallyPaid} from './order-finance';
import {doc,getDoc,runTransaction,serverTimestamp} from 'firebase/firestore';
import type {MealClient} from './meal-client';
import {ensureUser} from './firebase-client';
import {cleanName,isLocked,nameId} from './meal-client-model';
import {clearOrderPaymentLink} from './payment-group-client';

export async function placeOrderCart(client:MealClient,dayId:string,rawName:unknown,items:unknown){
 const user=await ensureUser(client.auth),admin=await client.isAdmin(),name=cleanName(rawName);
 if(!name||name.length>100||!Array.isArray(items)||!items.length||items.length>10)throw new Error('Chọn từ 1 đến 10 món và nhập tên hợp lệ.');
 const lines=await Promise.all(items.map(async item=>({dish:cleanName(item?.dish),dishId:await nameId(cleanName(item?.dish)),quantity:Number(item?.quantity),note:String(item?.note||'').trim()})));
 if(new Set(lines.map(l=>l.dishId)).size!==lines.length||lines.some(l=>!Number.isInteger(l.quantity)||l.quantity<1||l.quantity>30||l.note.length>300))throw new Error('Mỗi món cần số lượng 1–30; không chọn trùng món trong giỏ.');
 const personId=await nameId(name),personRef=doc(client.db,'days',dayId,'orderPeople',personId);
 // Cancel obsolete QR links separately before the atomic cart write. A large
 // cart then stays within Rules' 20-document budget even if each old line had
 // its own payment group. Confirmed, unfinished payments cannot be cleared.
 const previous=await Promise.all(Array.from({length:31},(_,i)=>getDoc(doc(client.db,'days',dayId,'orders',personId+(i?'_'+i:'')))));
 const affected=previous.filter(s=>s.exists()&&!s.data()?.paid&&!s.data()?.cancelled&&lines.some(l=>l.dishId===s.data()?.dishId));
 if(affected.some(s=>s.data()?.ownerId!==user.uid)&&!admin)throw new Error('Tên này đã thuộc người khác trong ngày. Vui lòng dùng tên riêng của bạn.');
 for(const old of affected)await clearOrderPaymentLink(client,dayId,old.id);
 const orderIds=await runTransaction(client.db,async tx=>{
  const [day,person,...slots]=await Promise.all([tx.get(doc(client.db,'days',dayId)),tx.get(personRef),...Array.from({length:31},(_,i)=>tx.get(doc(client.db,'days',dayId,'orders',personId+(i?'_'+i:''))))]);
  if(!day.exists()||isLocked({id:dayId,...day.data(),menu:[],source:false} as never))throw new Error('Đã chốt cơm. Cần mở lại ngày trước khi thay đổi đơn.');
  const owner=person.data()?.ownerId||slots[0].data()?.ownerId||user.uid;
  if(owner!==user.uid&&!admin)throw new Error('Tên này đã thuộc người khác trong ngày. Vui lòng dùng tên riêng của bạn.');
  const dishes=await Promise.all(lines.map(l=>tx.get(doc(client.db,'days',dayId,'dishes',l.dishId))));
  const changes:{index:number;line:typeof lines[number];price:number}[]=[],used=new Set<number>();
  for(const [i,line] of lines.entries()){
   const dish=dishes[i].data();if(!dish?.active||dish.name!==line.dish)throw new Error('Một món trong giỏ không còn được nhận. Vui lòng chọn lại.');
   // Paid portions remain a separate line so a new order never charges them twice.
   let index=slots.findIndex((s,j)=>!used.has(j)&&s.exists()&&!s.data()?.cancelled&&!s.data()?.paid&&s.data()?.dishId===line.dishId&&s.data()?.price===dish.price);
   if(index<0)index=slots.findIndex((s,j)=>j>0&&!used.has(j)&&(!s.exists()||(s.data()?.cancelled&&orderFinance(s.data() as never).held===0)));
   if(index<0)throw new Error('Đã đạt giới hạn 30 dòng món trong ngày. Vui lòng liên hệ quản trị viên.');
   used.add(index);const old=slots[index].data(),quantity=line.quantity+(old&&!old.cancelled?old.quantity:0);
   if(quantity>30)throw new Error('Tổng số lượng của một dòng món không được vượt quá 30 suất.');
   changes.push({index,line:{...line,quantity},price:old&&!old.cancelled&&old.dishId===line.dishId?old.price:dish.price});
  }
  // The links were cleared above. Rules still reject this atomic write if a
  // concurrent checkout created a new protected group in the meantime.
  if(!person.exists())tx.set(personRef,{name:slots[0].data()?.name||name,ownerId:owner,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  for(const {index,line,price} of changes){const old=slots[index].data();tx.set(slots[index].ref,{name:old?.name||name,ownerId:owner,dishId:line.dishId,dish:line.dish,quantity:line.quantity,price,note:line.note,...(old?moneyFields(old as never):{receivedAmount:0,refundedAmount:0,voidedAmount:0}),...(old?.paymentEventId?{paymentEventId:old.paymentEventId}:{}),...(old?.lastCreditTransferId?{lastCreditTransferId:old.lastCreditTransferId}:{}),paid:financiallyPaid({price,quantity:line.quantity,paid:false,...(old?moneyFields(old as never):{})}),cancelled:false,createdAt:old?.createdAt||serverTimestamp(),updatedAt:serverTimestamp()});}
  appendActivity(tx,client.db,user.uid,{kind:'order.create',summary:'Đặt giỏ nhiều món',dayId,details:{name,changes:changes.map(({index,line,price})=>({orderId:slots[index].id,before:orderAudit(slots[index].data()),after:{dish:line.dish,quantity:line.quantity,price,note:line.note}}))}});return changes.map(c=>slots[c.index].id);
 });
 return {name,orderIds};
}
