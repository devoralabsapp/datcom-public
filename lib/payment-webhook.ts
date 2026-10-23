import {orderFinance} from './order-finance';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {NotificationError,parseBankNotification,type BankNotification} from './bank-notification';
import type {PaymentLogEvent} from './payment-telegram';
import {validOrderId} from './meal-client-model';
import {verifyStatisticsViewer,StatisticsAccessError} from './statistics-access';

type Env=Record<string,string|undefined>;
type Value={stringValue?:string;integerValue?:string;booleanValue?:boolean;timestampValue?:string;arrayValue?:{values?:Value[]}};
type Document={name:string;fields:Record<string,Value>;updateTime:string};
type Data=Record<string,string|number|boolean>;
type Config={project:string;database:string;apiKey:string;refreshToken:string;authBase:string;firestoreBase:string};
const headers={'Cache-Control':'private, no-store','Vary':'Authorization'};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const decode=(doc:Document|null):Data=>Object.fromEntries(Object.entries(doc?.fields||{}).map(([k,v])=>[k,v.timestampValue??v.stringValue??(v.integerValue!==undefined?Number(v.integerValue):v.booleanValue??'')]));
const stringValue=(value:string)=>({stringValue:value});
const timestampValue=(value:string)=>({timestampValue:value});
class RestError extends Error{constructor(public status:number,public code:string){super('Firebase request failed.');}}
let cached:{key:string;token:string;uid:string;expires:number}|undefined;
function configuration(env:Env):Config{
 const project=env.NEXT_PUBLIC_FIREBASE_PROJECT_ID||'',database=env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID||'(default)',apiKey=env.NEXT_PUBLIC_FIREBASE_API_KEY||'',refreshToken=env.PAYMENT_FIREBASE_REFRESH_TOKEN||'';
 if(!/^[a-z0-9-]{6,100}$/.test(project)||!/^[A-Za-z0-9_()-]{1,100}$/.test(database)||!apiKey||!refreshToken)throw new Error('Webhook is not configured.');
 let authBase='https://securetoken.googleapis.com',firestoreBase='https://firestore.googleapis.com';
 if(env.NODE_ENV!=='production'&&project.startsWith('demo-')){
  const auth=env.FIREBASE_AUTH_EMULATOR_HOST,store=env.FIRESTORE_EMULATOR_HOST;
  if(!auth||!store||![auth,store].every(v=>/^127\.0\.0\.1:\d+$/.test(v)))throw new Error('Local demo requires both loopback emulators.');
  authBase=`http://${auth}/securetoken.googleapis.com`;firestoreBase=`http://${store}`;
 }
 return {project,database,apiKey,refreshToken,authBase,firestoreBase};
}
async function identity(config:Config){
 const key=sha(JSON.stringify(config));if(cached?.key===key&&cached.expires>Date.now())return cached;
 const response=await fetch(`${config.authBase}/v1/token?key=${encodeURIComponent(config.apiKey)}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:config.refreshToken}),cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok){cached=undefined;throw new RestError(response.status,'AUTH');}
 const data=await response.json();
 if(typeof data.id_token!=='string'||typeof data.user_id!=='string')throw new RestError(503,'AUTH');
 cached={key,token:data.id_token,uid:data.user_id,expires:Date.now()+Math.min(3300,Math.max(0,Number(data.expires_in)-120))*1000};return cached;
}
function receivedWrite(order:Document,amount:number){const f=orderFinance(decode(order) as never);return {update:{name:order.name,fields:{paid:{booleanValue:true},receivedAmount:{integerValue:String(f.receivedAmount+amount)},refundedAmount:{integerValue:String(f.refundedAmount)},voidedAmount:{integerValue:String(f.voidedAmount)}}},updateMask:{fieldPaths:['paid','receivedAmount','refundedAmount','voidedAmount']},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}],currentDocument:{updateTime:order.updateTime}};}
class Store{
 readonly root:string;readonly url:string;
 constructor(config:Config,private token:string){this.root=`projects/${config.project}/databases/${config.database}/documents`;this.url=config.firestoreBase+'/v1/'+this.root;}
 async call(suffix:string,method='POST',body?:unknown){
  const response=await fetch(this.url+suffix,{method,headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new RestError(response.status,data.error?.status||'UNKNOWN');}
  return response.json();
 }
 async get(path:string):Promise<Document|null>{try{return await this.call('/'+path,'GET');}catch(error){if(error instanceof RestError&&error.status===404)return null;throw error;}}
 async list(path:string):Promise<Document[]>{const all:Document[]=[];let page='';do{const result=await this.call('/'+path+'?pageSize=1000'+(page?'&pageToken='+encodeURIComponent(page):''),'GET');all.push(...(result.documents||[]));page=result.nextPageToken||'';if(all.length>1000)throw new Error('Invalid group size.');}while(page);return all;}
 create(path:string,fields:Record<string,Value>){return {update:{name:this.root+'/'+path,fields},currentDocument:{exists:false},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]};}
}
function bankActivity(store:Store,uid:string,reference:string,details:unknown,dayId='',orderId=''){return store.create('activityLogs/'+randomUUID().replace(/-/g,''),{kind:stringValue('bank.received'),actorId:stringValue(uid),source:stringValue('bank'),summary:stringValue('Ngân hàng xác nhận thanh toán'),dayId:stringValue(dayId),orderId:stringValue(orderId),reference:stringValue(reference),details:stringValue(JSON.stringify(details))});}
function matches(n:BankNotification,intent:Data,order:Data,bank:Data,link:Data,now:number){
 if(n.amount!==intent.amount)return 'amount_mismatch';
 if(n.bankBin!==intent.bankBin||n.accountNumber!==intent.accountNumber)return 'account_mismatch';
 if(bank.bankBin!==intent.bankBin||bank.accountNumber!==intent.accountNumber||bank.updatedAt!==intent.bankConfigUpdatedAt)return 'payee_changed';
 if(link.reference!==n.reference)return 'qr_replaced';
 if(Date.parse(String(intent.expiresAt))<=now)return 'qr_expired';
 if(order.cancelled===true)return 'order_cancelled';if(order.paid===true)return 'already_paid';
 if(order.ownerId!==intent.ownerId||order.createdAt!==intent.orderCreatedAt||order.dishId!==intent.dishId||order.price!==intent.price||order.quantity!==intent.quantity||orderFinance(order as never).due!==n.amount)return 'order_changed';
 const when=Date.parse(n.occurredAt);
 if(when<Date.parse(String(intent.createdAt))-120000||when>now+300000||when>Date.parse(String(intent.expiresAt)))return 'transaction_time_mismatch';
 return '';
}
async function settle(config:Config,notification:BankNotification,raw:string){
 const auth=await identity(config),store=new Store(config,auth.token),n=notification;
 const transactionKey=sha(`${n.bankBin}|${n.accountNumber}|${n.transactionId}`.toLowerCase());
 for(let attempt=0;attempt<3;attempt++){
  let committing=false;
  try{
   const intentDoc=await store.get('paymentIntents/'+n.reference);
   if(!intentDoc){const group=await store.get('paymentGroups/'+n.reference);return group?settleGroup(store,auth.uid,n,raw,transactionKey):{status:'unmatched',reason:'unknown_reference'};}
   const intent=decode(intentDoc),dayId=String(intent.dayId),orderId=String(intent.orderId);
   if(!/^[A-Za-z0-9_-]{1,100}$/.test(dayId)||!validOrderId(orderId))return {status:'unmatched',reason:'invalid_order'};
   const path=`days/${dayId}/orders/${orderId}`;
   const [orderDoc,bankDoc,linkDoc,receipt,seen]=await Promise.all([store.get(path),store.get('settings/payment'),store.get(`paymentLinks/${dayId}/orders/${orderId}`),store.get('paymentReceipts/'+n.reference),store.get('paymentTransactions/'+transactionKey)]);
   if(receipt)return {status:'duplicate',reason:'reference_already_processed'};
   if(seen)return {status:'duplicate',reason:'transaction_already_processed'};
   if(!orderDoc||!bankDoc||!linkDoc)return {status:'unmatched',reason:'missing_payment_data'};
   const mismatch=matches(n,intent,decode(orderDoc),decode(bankDoc),decode(linkDoc),Date.now());
   if(mismatch)return {status:'unmatched',reason:mismatch};
   const receiptFields={reference:stringValue(n.reference),transactionKey:stringValue(transactionKey),transactionId:stringValue(n.transactionId),amount:{integerValue:String(n.amount)},bankBin:stringValue(n.bankBin),accountNumber:stringValue(n.accountNumber),occurredAt:timestampValue(n.occurredAt),notificationHash:stringValue(sha(raw)),createdBy:stringValue(auth.uid)};
   const writes=[store.create('paymentReceipts/'+n.reference,receiptFields),store.create('paymentTransactions/'+transactionKey,{reference:stringValue(n.reference)}),receivedWrite(orderDoc,n.amount),bankActivity(store,auth.uid,n.reference,{amount:n.amount,name:intent.name,dish:decode(orderDoc).dish,quantity:intent.quantity},dayId,orderId)];
   // Commit is atomic. The order updateTime and receipt/transaction nonexistence
   // are preconditions; Rules recheck the current intent/link/payee at commit.
   committing=true;await store.call(':commit','POST',{writes});
   return {status:'paid',reference:n.reference,amount:n.amount};
  }catch(error){if(error instanceof RestError&&(['ABORTED','ALREADY_EXISTS','FAILED_PRECONDITION'].includes(error.code)||error.status===409||(committing&&error.status===403))&&attempt<2)continue;throw error;}
 }
 throw new RestError(503,'RETRY');
}
async function settleGroup(store:Store,uid:string,n:BankNotification,raw:string,transactionKey:string){
 let resumed=false;
 for(let attempt=0;attempt<4;attempt++){
  const [groupDoc,receiptDoc,seen,bankDoc]=await Promise.all([store.get('paymentGroups/'+n.reference),store.get('paymentReceipts/'+n.reference),store.get('paymentTransactions/'+transactionKey),store.get('settings/payment')]);
  if(!groupDoc||!bankDoc)return {status:'unmatched',reason:'missing_payment_data'};
  const g=decode(groupDoc),receipt=decode(receiptDoc),bank=decode(bankDoc);
  if(receiptDoc){
   // The first accepted bank record owns this group. A later, different
   // transfer cannot replace it, even while per-order settlement resumes.
   if(receipt.transactionKey!==transactionKey)return {status:'duplicate',reason:'reference_already_processed'};
   resumed=true;break;
  }
  if(seen)return {status:'duplicate',reason:'transaction_already_processed'};
  if(g.state!=='ready')return {status:'unmatched',reason:'order_changed'};
  if(n.amount!==g.amount)return {status:'unmatched',reason:'amount_mismatch'};
  if(n.bankBin!==g.bankBin||n.accountNumber!==g.accountNumber)return {status:'unmatched',reason:'account_mismatch'};
  if(bank.bankBin!==g.bankBin||bank.accountNumber!==g.accountNumber||bank.updatedAt!==g.bankConfigUpdatedAt)return {status:'unmatched',reason:'payee_changed'};
  if(Date.parse(String(g.expiresAt))<=Date.now())return {status:'unmatched',reason:'qr_expired'};
  const when=Date.parse(n.occurredAt);
  if(when<Date.parse(String(g.createdAt))-120000||when>Date.now()+300000||when>Date.parse(String(g.expiresAt)))return {status:'unmatched',reason:'transaction_time_mismatch'};
  const receiptFields={reference:stringValue(n.reference),transactionKey:stringValue(transactionKey),transactionId:stringValue(n.transactionId),amount:{integerValue:String(n.amount)},bankBin:stringValue(n.bankBin),accountNumber:stringValue(n.accountNumber),occurredAt:timestampValue(n.occurredAt),notificationHash:stringValue(sha(raw)),createdBy:stringValue(uid)};
  try{
   await store.call(':commit','POST',{writes:[store.create('paymentReceipts/'+n.reference,receiptFields),store.create('paymentTransactions/'+transactionKey,{reference:stringValue(n.reference)}),{update:{name:groupDoc.name,fields:{state:stringValue('paid')}},updateMask:{fieldPaths:['state']},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}],currentDocument:{updateTime:groupDoc.updateTime}},bankActivity(store,uid,n.reference,{amount:n.amount,name:g.name,count:g.count})]});break;
  }catch(error){if(error instanceof RestError&&[403,409].includes(error.status)&&attempt<3)continue;throw error;}
 }
 const remaining=await finishGroup(store,uid,n.reference);
 return resumed&&!remaining?{status:'duplicate',reason:'reference_already_processed'}:{status:'paid',reference:n.reference,amount:n.amount};
}
async function finishGroup(store:Store,uid:string,reference:string){
 const [items,settled]=await Promise.all([store.list('paymentGroups/'+reference+'/items'),store.list('paymentGroupSettlements/'+reference+'/items')]);
 const done=new Set(settled.map(d=>d.name.split('/').at(-1))),remaining=items.filter(d=>!done.has(d.name.split('/').at(-1)));
 // Each commit contains two order/marker pairs, staying within Rules' access
 // budget across days. Independent commits run concurrently and can resume.
 const batches=Array.from({length:Math.ceil(remaining.length/2)},(_,i)=>remaining.slice(i*2,i*2+2));
 for(let offset=0;offset<batches.length;offset+=6){const outcomes=await Promise.allSettled(batches.slice(offset,offset+6).map(async batch=>{
  for(let attempt=0;attempt<3;attempt++){
   const writes:unknown[]=[];
   for(const itemDoc of batch){const item=decode(itemDoc),key=String(item.key),dayId=String(item.dayId),orderId=String(item.orderId);
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(dayId)||!validOrderId(orderId)||key!==dayId+'~'+orderId)throw new Error('Invalid group item.');
    const markerPath='paymentGroupSettlements/'+reference+'/items/'+key,orderPath='days/'+dayId+'/orders/'+orderId;
    const [marker,order]=await Promise.all([store.get(markerPath),store.get(orderPath)]);if(marker)continue;if(!order)throw new Error('Missing grouped order.');
    writes.push(store.create(markerPath,{reference:stringValue(reference),dayId:stringValue(dayId),orderId:stringValue(orderId),createdBy:stringValue(uid)}),receivedWrite(order,Number(item.amount)));
   }
   if(!writes.length)return;
   try{await store.call(':commit','POST',{writes});return;}catch(error){if(error instanceof RestError&&[403,409].includes(error.status)&&attempt<2)continue;throw error;}
  }
 }));const failure=outcomes.find(o=>o.status==='rejected');if(failure?.status==='rejected')throw failure.reason;}
 return remaining.length;
}
async function boundedBody(request:Request){
 if(Number(request.headers.get('content-length')||0)>16000)throw new RangeError('Body too large.');
 const reader=request.body?.getReader();if(!reader)return '';const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16000){await reader.cancel();throw new RangeError('Body too large.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export async function bankWebhook(request:Request,env:Env=process.env,onLog?:(event:PaymentLogEvent)=>void){
 const secret=env.PAYMENT_WEBHOOK_SECRET||'';
 if(!/^[A-Za-z0-9_-]{32,256}$/.test(secret))return json({error:'Webhook chưa được cấu hình.'},503);
 const supplied=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1]||'';
 if(supplied.length!==secret.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(secret)))return json({error:'Không được phép.'},401);
 const requestId=randomUUID(),receivedAt=new Date().toISOString();let parsed:BankNotification|undefined;
 async function respond(value:PaymentLogEvent['result'],status=200,notification?:string){
  if(notification&&((value as {status?:string}).status!=='paid')){try{const config=configuration(env),bot=await identity(config),store=new Store(config,bot.token);await store.call(':commit','POST',{writes:[store.create('activityLogs/'+randomUUID().replace(/-/g,''),{kind:stringValue('bank.notice'),actorId:stringValue(bot.uid),source:stringValue('bank'),summary:stringValue('Kết quả xử lý thông báo ngân hàng'),dayId:stringValue(''),orderId:stringValue(''),reference:stringValue(parsed?.reference||''),details:stringValue(JSON.stringify({status:(value as {status?:string}).status||'error',reason:(value as {reason?:string}).reason||'',httpStatus:status,amount:parsed?.amount||0}))})]});}catch{console.warn('[payment-activity] write_failed');}}

  try{onLog?.({requestId,receivedAt,httpStatus:status,result:value,notification,parsed});}catch{console.warn('[payment-telegram] scheduling_failed');}
  return json(value,status);
 }
 const kind=request.headers.get('content-type')?.split(';')[0].toLowerCase();
 if(kind!=='application/json'&&kind!=='text/plain')return respond({error:'Dùng application/json hoặc text/plain.'},415);
 let raw:string;
 try{
  const body=await boundedBody(request);
  if(kind==='application/json'){const data=JSON.parse(body);if(!data||Array.isArray(data)||Object.keys(data).length!==1||typeof data.notification!=='string')return respond({error:'JSON cần duy nhất trường notification kiểu văn bản.'},400);raw=data.notification;}else raw=body;
 }catch(error){return respond({error:error instanceof RangeError?'Thông báo quá dài.':'Nội dung yêu cầu chưa hợp lệ.'},error instanceof RangeError?413:400);}
 try{const config=configuration(env);parsed=parseBankNotification(raw,new Date(receivedAt));return respond(await settle(config,parsed,raw),200,raw);}
 catch(error){if(error instanceof NotificationError)return respond({status:'unmatched',reason:'notification_not_supported',message:error.message},422,raw);return respond({error:'Chưa xử lý được. Kiểm tra cấu hình kết nối, quyền Rules và thử gửi lại cùng thông báo.'},503,raw);}
}

// This endpoint never accepts bank facts. It can only finish a group whose
// bank receipt has already been accepted through the secret-protected webhook.
export async function resumeGroupPayment(request:Request,reference:string,env:Env=process.env){
 if(!/^COM[A-F0-9]{20}$/.test(reference))return json({error:'Mã thanh toán chưa hợp lệ.'},400);
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]||'';
 try{
  const config=configuration(env),uid=await verifyStatisticsViewer(token,{projectId:config.project,apiKey:config.apiKey,authHost:env.NODE_ENV!=='production'?env.FIREBASE_AUTH_EMULATOR_HOST:undefined});
  const bot=await identity(config),store=new Store(config,bot.token),group=await store.get('paymentGroups/'+reference);
  if(!group)return json({error:'Không tìm thấy khoản thanh toán.'},404);
  const g=decode(group),owners=group.fields.ownerIds?.arrayValue?.values?.map(v=>v.stringValue)||[];
  let allowed=g.requestedBy===uid||owners.includes(uid);
  if(!allowed){try{allowed=decode(await new Store(config,token).get('admins/'+uid)).enabled===true;}catch{allowed=false;}}
  if(!allowed)return json({error:'Bạn chỉ được thanh toán đơn chưa trả của mình; quản trị có thể làm hộ.'},403);
  const receipt=await store.get('paymentReceipts/'+reference);
  if(g.state!=='paid'||!receipt)return json({error:'Ngân hàng chưa xác nhận khoản thanh toán này.'},409);
  await finishGroup(store,bot.uid,reference);return json({status:'paid',reference,amount:Number(g.amount)});
 }catch(error){return json({error:error instanceof StatisticsAccessError?error.message:'Chưa cập nhật xong. Vui lòng thử lại.'},error instanceof StatisticsAccessError?error.status:503);}
}
