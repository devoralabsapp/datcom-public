import {createHash,timingSafeEqual} from 'node:crypto';
import {NotificationError,parseBankNotification,type BankNotification} from './bank-notification';

type Env=Record<string,string|undefined>;
type Value={stringValue?:string;integerValue?:string;booleanValue?:boolean;timestampValue?:string};
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
class Store{
 readonly root:string;readonly url:string;
 constructor(config:Config,private token:string){this.root=`projects/${config.project}/databases/${config.database}/documents`;this.url=config.firestoreBase+'/v1/'+this.root;}
 async call(suffix:string,method='POST',body?:unknown){
  const response=await fetch(this.url+suffix,{method,headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new RestError(response.status,data.error?.status||'UNKNOWN');}
  return response.json();
 }
 async get(path:string):Promise<Document|null>{try{return await this.call('/'+path,'GET');}catch(error){if(error instanceof RestError&&error.status===404)return null;throw error;}}
 create(path:string,fields:Record<string,Value>){return {update:{name:this.root+'/'+path,fields},currentDocument:{exists:false},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]};}
}
function matches(n:BankNotification,intent:Data,order:Data,bank:Data,link:Data,now:number){
 if(n.amount!==intent.amount)return 'amount_mismatch';
 if(n.bankBin!==intent.bankBin||n.accountNumber!==intent.accountNumber)return 'account_mismatch';
 if(bank.bankBin!==intent.bankBin||bank.accountNumber!==intent.accountNumber||bank.updatedAt!==intent.bankConfigUpdatedAt)return 'payee_changed';
 if(link.reference!==n.reference)return 'qr_replaced';
 if(Date.parse(String(intent.expiresAt))<=now)return 'qr_expired';
 if(order.cancelled===true)return 'order_cancelled';if(order.paid===true)return 'already_paid';
 if(order.ownerId!==intent.ownerId||order.createdAt!==intent.orderCreatedAt||order.dishId!==intent.dishId||order.price!==intent.price||order.quantity!==intent.quantity||Number(order.price)*Number(order.quantity)!==n.amount)return 'order_changed';
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
   if(!intentDoc)return {status:'unmatched',reason:'unknown_reference'};
   const intent=decode(intentDoc),dayId=String(intent.dayId),orderId=String(intent.orderId);
   if(!/^[A-Za-z0-9_-]{1,100}$/.test(dayId)||!/^[a-f0-9]{64}$/.test(orderId))return {status:'unmatched',reason:'invalid_order'};
   const path=`days/${dayId}/orders/${orderId}`;
   const [orderDoc,bankDoc,linkDoc,receipt,seen]=await Promise.all([store.get(path),store.get('settings/payment'),store.get(`paymentLinks/${dayId}/orders/${orderId}`),store.get('paymentReceipts/'+n.reference),store.get('paymentTransactions/'+transactionKey)]);
   if(receipt)return {status:'duplicate',reason:'reference_already_processed'};
   if(seen)return {status:'duplicate',reason:'transaction_already_processed'};
   if(!orderDoc||!bankDoc||!linkDoc)return {status:'unmatched',reason:'missing_payment_data'};
   const mismatch=matches(n,intent,decode(orderDoc),decode(bankDoc),decode(linkDoc),Date.now());
   if(mismatch)return {status:'unmatched',reason:mismatch};
   const receiptFields={reference:stringValue(n.reference),transactionKey:stringValue(transactionKey),transactionId:stringValue(n.transactionId),amount:{integerValue:String(n.amount)},bankBin:stringValue(n.bankBin),accountNumber:stringValue(n.accountNumber),occurredAt:timestampValue(n.occurredAt),notificationHash:stringValue(sha(raw)),createdBy:stringValue(auth.uid)};
   const writes=[store.create('paymentReceipts/'+n.reference,receiptFields),store.create('paymentTransactions/'+transactionKey,{reference:stringValue(n.reference)}),{update:{name:store.root+'/'+path,fields:{paid:{booleanValue:true}}},updateMask:{fieldPaths:['paid']},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}],currentDocument:{updateTime:orderDoc.updateTime}}];
   // Commit is atomic. The order updateTime and receipt/transaction nonexistence
   // are preconditions; Rules recheck the current intent/link/payee at commit.
   committing=true;await store.call(':commit','POST',{writes});
   return {status:'paid',reference:n.reference,amount:n.amount};
  }catch(error){if(error instanceof RestError&&(['ABORTED','ALREADY_EXISTS','FAILED_PRECONDITION'].includes(error.code)||error.status===409||(committing&&error.status===403))&&attempt<2)continue;throw error;}
 }
 throw new RestError(503,'RETRY');
}
async function boundedBody(request:Request){
 if(Number(request.headers.get('content-length')||0)>16000)throw new RangeError('Body too large.');
 const reader=request.body?.getReader();if(!reader)return '';const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16000){await reader.cancel();throw new RangeError('Body too large.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export async function bankWebhook(request:Request,env:Env=process.env){
 const secret=env.PAYMENT_WEBHOOK_SECRET||'';
 if(!/^[A-Za-z0-9_-]{32,256}$/.test(secret))return json({error:'Webhook chưa được cấu hình.'},503);
 const supplied=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1]||'';
 if(supplied.length!==secret.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(secret)))return json({error:'Không được phép.'},401);
 const kind=request.headers.get('content-type')?.split(';')[0].toLowerCase();
 if(kind!=='application/json'&&kind!=='text/plain')return json({error:'Dùng application/json hoặc text/plain.'},415);
 let raw:string;
 try{
  const body=await boundedBody(request);
  if(kind==='application/json'){const data=JSON.parse(body);if(!data||Array.isArray(data)||Object.keys(data).length!==1||typeof data.notification!=='string')return json({error:'JSON cần duy nhất trường notification kiểu văn bản.'},400);raw=data.notification;}else raw=body;
 }catch(error){return json({error:error instanceof RangeError?'Thông báo quá dài.':'Nội dung yêu cầu chưa hợp lệ.'},error instanceof RangeError?413:400);}
 try{return json(await settle(configuration(env),parseBankNotification(raw),raw));}
 catch(error){if(error instanceof NotificationError)return json({status:'unmatched',reason:'notification_not_supported',message:error.message},422);return json({error:'Chưa xử lý được. Kiểm tra cấu hình kết nối, quyền Rules và thử gửi lại cùng thông báo.'},503);}
}
