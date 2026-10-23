import {collection,doc,getDoc,getDocs,query,where,runTransaction,serverTimestamp} from 'firebase/firestore';
import type {MealClient} from './meal-client';
import {ensureUser} from './firebase-client';
import {orderFinance,moneyFields,financiallyPaid} from './order-finance';
import {paymentItemKey,type PaymentOrderRef} from './payment-group';
import {invalidateLinkedGroup} from './payment-group-client';
import {appendActivity,orderAudit} from './activity';

export class CreditCoveredError extends Error{constructor(){super('Số dư đã thanh toán đủ. Không cần chuyển khoản thêm.');}}
export async function readCreditSources(client:MealClient,uid?:string){
 const ref=collection(client.db,'creditSources'),index=await getDocs(uid?query(ref,where('ownerId','==',uid)):ref);
 const sources=[];
 for(let i=0;i<index.docs.length;i+=12){const values=await Promise.all(index.docs.slice(i,i+12).map(async s=>{const v=s.data(),ref={dayId:String(v.dayId),orderId:String(v.orderId)};if(s.id!==paymentItemKey(ref))throw new Error('Nguồn số dư chưa hợp lệ.');const order=await getDoc(doc(client.db,'days',ref.dayId,'orders',ref.orderId));return {key:s.id,...ref,order:order.data()};}));sources.push(...values.filter(v=>v.order&&(!uid||v.order.ownerId===uid)));}
 return sources.sort((a,b)=>a.dayId.localeCompare(b.dayId)||a.orderId.localeCompare(b.orderId));
}
export async function creditBalances(client:MealClient){const sources=await readCreditSources(client);const balances:Record<string,number>=Object.create(null);for(const source of sources){const o=source.order!;balances[o.ownerId]=(balances[o.ownerId]||0)+orderFinance(o as never).creditAvailable;}return balances;}
export async function chooseSurplus(client:MealClient,ref:PaymentOrderRef,choice:'refund'|'carry'){
 const user=await ensureUser(client.auth),admin=await client.isAdmin(),key=paymentItemKey(ref),orderRef=doc(client.db,'days',ref.dayId,'orders',ref.orderId),sourceRef=doc(client.db,'creditSources',key);
 await runTransaction(client.db,async tx=>{
  const [snapshot,index]=await Promise.all([tx.get(orderRef),tx.get(sourceRef)]),o=snapshot.data();if(!o||(!admin&&o.ownerId!==user.uid)||orderFinance(o as never).surplus<=0)throw new Error('Không có tiền thừa để lựa chọn.');
  if(orderFinance(o as never).surplusChoice===choice)return;
  const apply=await invalidateLinkedGroup(client,tx,ref.dayId,ref.orderId);apply();tx.update(orderRef,{...moneyFields(o as never),surplusChoice:choice,updatedAt:serverTimestamp()});
  if(choice==='carry'&&!index.exists())tx.set(sourceRef,{...ref,ownerId:o.ownerId,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  appendActivity(tx,client.db,user.uid,{kind:'credit.choice',summary:choice==='carry'?'Giữ tiền thừa cho lần sau':'Yêu cầu hoàn tiền',...ref,details:{name:o.name,amount:orderFinance(o as never).surplus,choice}});
 });
}
export async function applyCredit(client:MealClient,targets:PaymentOrderRef[]){
 const user=await ensureUser(client.auth),admin=await client.isAdmin();let used=0;
 const available=(await readCreditSources(client,admin?undefined:user.uid)).filter(s=>orderFinance(s.order as never).creditAvailable>0);if(!available.length)return 0;
 const sorted=[...new Map(targets.map(t=>[paymentItemKey(t),t])).values()].sort((a,b)=>a.dayId.localeCompare(b.dayId)||a.orderId.localeCompare(b.orderId));
 for(const target of sorted){const initial=await getDoc(doc(client.db,'days',target.dayId,'orders',target.orderId)),owner=initial.data()?.ownerId;if(!owner||(!admin&&owner!==user.uid))continue;
  for(const source of available.filter(s=>s.order?.ownerId===owner)){if(source.key===paymentItemKey(target))continue;
   // Rules can reject a stale paired write before Firestore returns its
   // transaction-conflict status. Retry from fresh reads, without relaxing
   // any ownership or balance check.
   for(let attempt=0;attempt<3;attempt++){try{used+=await runTransaction(client.db,async tx=>{
    const sref=doc(client.db,'days',source.dayId,'orders',source.orderId),tref=doc(client.db,'days',target.dayId,'orders',target.orderId),[s,t]=await Promise.all([tx.get(sref),tx.get(tref)]),so=s.data(),to=t.data();
    if(!so||!to||so.ownerId!==owner||to.ownerId!==owner||to.cancelled)return 0;
    const amount=Math.min(orderFinance(so as never).creditAvailable,orderFinance(to as never).due);if(amount<=0)return 0;
    const [invalidateSource,invalidateTarget]=await Promise.all([invalidateLinkedGroup(client,tx,source.dayId,source.orderId),invalidateLinkedGroup(client,tx,target.dayId,target.orderId)]);
    const id=crypto.randomUUID().replace(/-/g,''),sf={...moneyFields(so as never),creditOutAmount:orderFinance(so as never).creditOutAmount+amount},tf={...moneyFields(to as never),creditInAmount:orderFinance(to as never).creditInAmount+amount};
    invalidateSource();invalidateTarget();tx.update(sref,{...sf,paid:financiallyPaid({...so,...sf} as never),lastCreditTransferId:id,updatedAt:serverTimestamp()});tx.update(tref,{...tf,paid:financiallyPaid({...to,...tf} as never),lastCreditTransferId:id,updatedAt:serverTimestamp()});
    tx.set(doc(client.db,'creditTransfers',id),{ownerId:owner,sourceDayId:source.dayId,sourceOrderId:source.orderId,targetDayId:target.dayId,targetOrderId:target.orderId,amount,createdBy:user.uid,createdAt:serverTimestamp()});
    appendActivity(tx,client.db,user.uid,{kind:'credit.apply',summary:'Dùng số dư thanh toán đơn',...target,details:{amount,transferId:id,source:{...source,order:orderAudit(so)},before:orderAudit(to),after:orderAudit({...to,...tf,paid:financiallyPaid({...to,...tf} as never)})}});return amount;
   });break;}catch(e){if((e as {code?:string}).code!=='permission-denied'||attempt===2)throw e;}}
  }
 }
 return used;
}
