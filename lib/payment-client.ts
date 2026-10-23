import {applyCredit,CreditCoveredError} from './credit-client';
import {appendActivity} from './activity';
import {orderFinance} from './order-finance';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,setPersistence,inMemoryPersistence,signInAnonymously,connectAuthEmulator,deleteUser} from 'firebase/auth';
import {collection,doc,getDoc,getDocs,runTransaction,serverTimestamp,Timestamp,updateDoc} from 'firebase/firestore';
import type {MealClient} from './meal-client';
import {ensureUser} from './firebase-client';
import {isBankAccount,normalizeBankAccount,newPaymentReference,paymentDescription,type BankAccount,type PaymentIntent} from './payment-model';
import {PRIMARY_ADMIN_UID} from './user-model';
import {validOrderId} from './meal-client-model';
import {invalidateLinkedGroup} from './payment-group-client';

export async function saveBankAccount(client:MealClient,value:BankAccount){
 const user=await ensureUser(client.auth);if(!await client.isAdmin())throw new Error('Chỉ quản trị viên được đổi tài khoản nhận tiền.');
 const account=normalizeBankAccount(value);
 await runTransaction(client.db,async tx=>{await tx.get(doc(client.db,'settings','payment'));tx.set(doc(client.db,'settings','payment'),{...account,updatedAt:serverTimestamp()});appendActivity(tx,client.db,user.uid,{kind:'payment.settings',summary:'Đổi tài khoản nhận tiền',details:{bankName:account.bankName,accountLast4:account.accountNumber.slice(-4)}});});
 return account;
}
export async function requestPayment(client:MealClient,dayId:string,orderId:string):Promise<PaymentIntent>{
 const user=await ensureUser(client.auth),admin=await client.isAdmin();
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(dayId)||!validOrderId(orderId))throw new Error('Đơn thanh toán chưa hợp lệ.');
 await applyCredit(client,[{dayId,orderId}]);const current=await getDoc(doc(client.db,'days',dayId,'orders',orderId));if(current.data()?.paid)throw new CreditCoveredError();
 const orderRef=doc(client.db,'days',dayId,'orders',orderId),settingsRef=doc(client.db,'settings','payment'),linkRef=doc(client.db,'paymentLinks',dayId,'orders',orderId);
 return runTransaction(client.db,async tx=>{
  const [orderSnapshot,settings,link]=await Promise.all([tx.get(orderRef),tx.get(settingsRef),tx.get(linkRef)]);
  const order=orderSnapshot.data(),account=settings.data(),bankVersion=settings.data()?.updatedAt;
  if(!order||order.cancelled||order.paid)throw new Error('Đơn đã thanh toán, đã hủy hoặc không còn tồn tại.');
  if(order.ownerId!==user.uid&&!admin)throw new Error('Bạn chỉ được tạo QR cho đơn của mình.');
  if(!isBankAccount(account)||!bankVersion?.toMillis())throw new Error('Quản trị viên cần nhập tài khoản nhận tiền trước.');
  const amount=orderFinance(order as never).due;
  if(link.data()?.reference&&link.data()?.kind!=='group'){
   try{
    const code=link.data()!.reference,previous=await tx.get(doc(client.db,'paymentIntents',code)),receipt=await tx.get(doc(client.db,'paymentReceipts',code)),v=previous.data();
    if(v&&!receipt.exists()&&v.expiresAt.toMillis()>Date.now()+60000&&v.ownerId===order.ownerId&&v.orderCreatedAt.isEqual(order.createdAt)&&v.dishId===order.dishId&&v.price===order.price&&v.quantity===order.quantity&&v.amount===amount&&v.bankConfigUpdatedAt.isEqual(bankVersion))return {...v,expiresAt:v.expiresAt.toDate().toISOString()} as PaymentIntent;
   }catch(error){
    // Linking an existing Google account can transfer the order to a new UID.
    // Its owner can replace the link without reading the former owner's intent.
    if((error as {code?:string}).code!=='permission-denied')throw error;
   }
  }
  const reference=newPaymentReference(),description=paymentDescription(reference),expiresAt=Timestamp.fromMillis(Date.now()+23*3600000);
  const invalidate=await invalidateLinkedGroup(client,tx,dayId,orderId);invalidate();
  const value={bankBin:account.bankBin,bankName:account.bankName,accountNumber:account.accountNumber,accountName:account.accountName,reference,dayId,orderId,ownerId:order.ownerId,requestedBy:user.uid,name:order.name,amount,dishId:order.dishId,price:order.price,quantity:order.quantity,description,orderCreatedAt:order.createdAt,bankConfigUpdatedAt:bankVersion,createdAt:serverTimestamp(),expiresAt};
  tx.set(doc(client.db,'paymentIntents',reference),value);tx.set(linkRef,{reference,updatedAt:serverTimestamp()});appendActivity(tx,client.db,user.uid,{kind:'payment.qr',summary:'Tạo QR thanh toán',dayId,orderId,reference,details:{name:order.name,amount,dish:order.dish,quantity:order.quantity}});
  return {...value,expiresAt:expiresAt.toDate().toISOString()};
 });
}
export async function paymentIntegrations(client:MealClient){
 if(!await client.isAdmin())throw new Error('Chỉ quản trị viên được xem kết nối Shortcut.');
 const list=await getDocs(collection(client.db,'paymentIntegrations'));
 return list.docs.map(d=>({uid:d.id,enabled:d.data().enabled===true}));
}
export async function revokePaymentIntegration(client:MealClient,uid:string){
 const user=await ensureUser(client.auth);
 if(user.uid!==PRIMARY_ADMIN_UID||!await client.isAdmin())throw new Error('Chỉ quản trị chính được ngắt kết nối Shortcut.');
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid))throw new Error('Kết nối chưa hợp lệ.');
 await updateDoc(doc(client.db,'paymentIntegrations',uid),{enabled:false,updatedAt:serverTimestamp()});
}
export async function createPaymentIntegration(client:MealClient){
 const user=await ensureUser(client.auth);
 if(user.uid!==PRIMARY_ADMIN_UID||!await client.isAdmin())throw new Error('Chỉ quản trị chính được tạo kết nối Shortcut.');
 const app=initializeApp(client.auth.app.options,'payment-integration-'+crypto.randomUUID()),auth=getAuth(app);let created=false;
 try{
  const host=process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
  if(host){if(process.env.NODE_ENV==='production'||!String(app.options.projectId).startsWith('demo-')||!/^127\.0\.0\.1:\d+$/.test(host))throw new Error('Emulator chưa hợp lệ.');connectAuthEmulator(auth,'http://'+host,{disableWarnings:true});}
  await setPersistence(auth,inMemoryPersistence);const result=await signInAnonymously(auth);
  await runTransaction(client.db,async tx=>{const ref=doc(client.db,'paymentIntegrations',result.user.uid);await tx.get(ref);tx.set(ref,{enabled:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});});created=true;
  const secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  return {uid:result.user.uid,secret,refreshToken:result.user.refreshToken};
 }finally{if(!created&&auth.currentUser)await deleteUser(auth.currentUser).catch(()=>{});await deleteApp(app);}
}
