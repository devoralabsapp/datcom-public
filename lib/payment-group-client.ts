import {applyCredit,CreditCoveredError} from './credit-client';
import {appendActivity} from './activity';
import {orderFinance} from './order-finance';
import {collection,doc,getDoc,getDocs,runTransaction,serverTimestamp,Timestamp,type Transaction} from 'firebase/firestore';
import type {MealClient} from './meal-client';
import {ensureUser} from './firebase-client';
import {nameId} from './meal-client-model';
import {isBankAccount,newPaymentReference} from './payment-model';
import {personKey} from './statistics';
import {paymentItemKey,paymentSelection,type PaymentOrderRef,type PaymentGroup,type GroupItem} from './payment-group';

// Read before any transaction writes. Return a write-only closure so callers can
// invalidate several linked groups without reading after their first write.
export async function invalidateLinkedGroup(client:MealClient,tx:Transaction,dayId:string,orderId:string){
 const link=await tx.get(doc(client.db,'paymentLinks',dayId,'orders',orderId));
 if(link.data()?.kind!=='group')return ()=>{};
 const reference=String(link.data()!.reference),groupRef=doc(client.db,'paymentGroups',reference),key=paymentItemKey({dayId,orderId});
 const [group,settled]=await Promise.all([tx.get(groupRef),tx.get(doc(client.db,'paymentGroupSettlements',reference,'items',key))]);
 if(settled.exists()||!group.exists())return ()=>{};
 const value=group.data()!;
 if(value.state==='paid')throw new Error('Ngân hàng đã xác nhận khoản gộp; đang cập nhật từng đơn. Vui lòng thử lại sau.');
 if(value.state==='invalid'||value.expiresAt.toMillis()<=Date.now())return ()=>{};
 return ()=>tx.update(groupRef,{state:'invalid',invalidatedDayId:dayId,invalidatedOrderId:orderId,updatedAt:serverTimestamp()});
}

export async function cancelPaymentGroup(client:MealClient,reference:string){
 await runTransaction(client.db,async tx=>{const ref=doc(client.db,'paymentGroups',reference),snapshot=await tx.get(ref);if(snapshot.exists()&&['building','ready'].includes(snapshot.data().state))tx.update(ref,{state:'invalid',invalidatedDayId:'',invalidatedOrderId:'',updatedAt:serverTimestamp()});});
}

export async function clearOrderPaymentLink(client:MealClient,dayId:string,orderId:string){
 await runTransaction(client.db,async tx=>{
  const ref=doc(client.db,'paymentLinks',dayId,'orders',orderId),link=await tx.get(ref);if(!link.exists())return;
  const apply=await invalidateLinkedGroup(client,tx,dayId,orderId);apply();tx.delete(ref);
 });
}

export async function requestPaymentGroup(client:MealClient,orders:PaymentOrderRef[],onProgress?:(done:number,total:number)=>void,signal?:AbortSignal):Promise<PaymentGroup>{
 let refs=paymentSelection(orders);await applyCredit(client,refs);const states=await Promise.all(refs.map(ref=>getDoc(doc(client.db,'days',ref.dayId,'orders',ref.orderId))));refs=refs.filter((_,i)=>states[i].exists()&&!states[i].data()?.paid&&!states[i].data()?.cancelled);if(!refs.length)throw new CreditCoveredError();const user=await ensureUser(client.auth),admin=await client.isAdmin(),first=refs[0];
 const firstDoc=await getDoc(doc(client.db,'days',first.dayId,'orders',first.orderId)),firstOrder=firstDoc.data();
 if(!firstOrder||firstOrder.paid||firstOrder.cancelled||(!admin&&firstOrder.ownerId!==user.uid))throw new Error('Bạn chỉ được thanh toán đơn chưa trả của mình; quản trị có thể làm hộ.');
 const hash=await nameId(refs.map(paymentItemKey).join('|')),settings=await getDoc(doc(client.db,'settings','payment')),account=settings.data();
 if(!isBankAccount(account))throw new Error('Quản trị viên cần nhập tài khoản nhận tiền trước.');
 const oldLink=await getDoc(doc(client.db,'paymentLinks',first.dayId,'orders',first.orderId));
 if(oldLink.data()?.kind==='group'){
  const old=await getDoc(doc(client.db,'paymentGroups',oldLink.data()!.reference)),v=old.data();
  if(v?.state==='ready'&&v.selectionHash===hash&&v.expiresAt.toMillis()>Date.now()+60000&&v.bankConfigUpdatedAt.isEqual(settings.data()!.updatedAt)){
   const items=await getDocs(collection(client.db,'paymentGroups',old.id,'items'));
   if(items.size===refs.length&&items.docs.map(d=>d.id).sort().join('|')===refs.map(paymentItemKey).sort().join('|')&&(admin||items.docs.every(d=>d.data().ownerId===user.uid)))return {...v,expiresAt:v.expiresAt.toDate().toISOString(),items:items.docs.map(d=>d.data() as GroupItem)} as PaymentGroup;
  }
 }
 const reference=newPaymentReference(),groupRef=doc(client.db,'paymentGroups',reference),expiresAt=Timestamp.fromMillis(Date.now()+23*3600000),items:GroupItem[]=[];
 try{
  await runTransaction(client.db,async tx=>{
   const [empty,bank]=await Promise.all([tx.get(groupRef),tx.get(doc(client.db,'settings','payment'))]);
   if(empty.exists()||!isBankAccount(bank.data()))throw new Error('Cấu hình thanh toán vừa thay đổi. Vui lòng thử lại.');
   const b=bank.data()!;tx.set(groupRef,{reference,requestedBy:user.uid,name:firstOrder.name,personKey:personKey(firstOrder.name),ownerIds:[],amount:0,count:0,expectedCount:refs.length,lastItemKey:'',state:'building',selectionHash:hash,bankBin:b.bankBin,bankName:b.bankName,accountNumber:b.accountNumber,accountName:b.accountName,bankConfigUpdatedAt:b.updatedAt,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),expiresAt,invalidatedDayId:'',invalidatedOrderId:''});
  });
  for(const [index,ref] of refs.entries()){
   if(signal?.aborted)throw new Error('Đã dừng tạo QR thanh toán.');
   const item=await runTransaction(client.db,async tx=>{
    const key=paymentItemKey(ref),itemRef=doc(client.db,'paymentGroups',reference,'items',key),orderRef=doc(client.db,'days',ref.dayId,'orders',ref.orderId);
    const [group,order,prior,day]=await Promise.all([tx.get(groupRef),tx.get(orderRef),tx.get(itemRef),tx.get(doc(client.db,'days',ref.dayId))]),g=group.data()!,o=order.data();
    if(!o||o.paid||o.cancelled||(!admin&&o.ownerId!==user.uid)||personKey(o.name)!==g.personKey||g.state!=='building'||prior.exists())throw new Error('Danh sách thanh toán vừa thay đổi. Vui lòng cập nhật rồi thử lại.');
    const apply=await invalidateLinkedGroup(client,tx,ref.dayId,ref.orderId),amount=orderFinance(o as never).due;
    if(g.amount+amount>30000000)throw new Error('Tổng mỗi lần thanh toán tối đa 30.000.000đ. Hãy chọn ít đơn hơn.');
    const value={...ref,key,date:String(day.data()?.date||''),name:o.name,dish:o.dish,ownerId:o.ownerId,dishId:o.dishId,price:o.price,quantity:o.quantity,amount,orderCreatedAt:o.createdAt};
    apply();tx.set(itemRef,value);tx.update(groupRef,{count:g.count+1,amount:g.amount+amount,lastItemKey:key,ownerIds:[...new Set([...g.ownerIds,o.ownerId])],updatedAt:serverTimestamp()});tx.set(doc(client.db,'paymentLinks',ref.dayId,'orders',ref.orderId),{reference,kind:'group',updatedAt:serverTimestamp()});return value;
   });
   items.push(item);onProgress?.(index+1,refs.length);
  }
  if(signal?.aborted)throw new Error('Đã dừng tạo QR thanh toán.');
  await runTransaction(client.db,async tx=>{const value=(await tx.get(groupRef)).data();if(value?.state!=='building'||value.count!==refs.length)throw new Error('Danh sách thanh toán vừa thay đổi. Vui lòng cập nhật rồi thử lại.');tx.update(groupRef,{state:'ready',updatedAt:serverTimestamp()});appendActivity(tx,client.db,user.uid,{kind:'payment.qr',summary:'Tạo QR thanh toán gộp',reference,details:{name:firstOrder.name,amount:value.amount,count:refs.length,orders:refs.slice(0,100)}});});
  const g=(await getDoc(groupRef)).data()!;return {...g,expiresAt:g.expiresAt.toDate().toISOString(),items} as PaymentGroup;
 }catch(error){await cancelPaymentGroup(client,reference).catch(()=>{});throw error;}
}
