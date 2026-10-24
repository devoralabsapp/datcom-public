import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {verifyStatisticsViewer,StatisticsAccessError} from './statistics-access';
import {backupServiceStore} from './payment-webhook';
import {MAX_BACKUP_BYTES,parsePersonalBackup,type PersonalBackup,type BackupOrder,type Row} from './personal-backup-model';
type Env=Record<string,string|undefined>;
type Value={stringValue?:string;integerValue?:string;doubleValue?:number;booleanValue?:boolean;timestampValue?:string;nullValue?:null;arrayValue?:{values?:Value[]};mapValue?:{fields?:Record<string,Value>}};
type Document={name:string;fields?:Record<string,Value>};
const headers={'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
const mismatch='File đã bị thay đổi hoặc không khớp bản xuất trên server. Không nhập dữ liệu; hãy chọn file gốc hoặc xuất lại.';
class BackupError extends Error{constructor(message:string,public status=503){super(message);}}
function decode(v:Value):unknown{if(v.stringValue!==undefined)return v.stringValue;if(v.timestampValue!==undefined)return v.timestampValue;if(v.integerValue!==undefined)return Number(v.integerValue);if(v.doubleValue!==undefined)return v.doubleValue;if(v.booleanValue!==undefined)return v.booleanValue;if(v.arrayValue)return (v.arrayValue.values||[]).map(decode);if(v.mapValue)return decodeFields(v.mapValue.fields||{});return null;}
const decodeFields=(fields:Record<string,Value>):Row=>Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,decode(v)]));
const row=(document:Document)=>({id:document.name.split('/').at(-1)!,...decodeFields(document.fields||{})});
const sha=(raw:string)=>createHash('sha256').update(raw,'utf8').digest('hex');
class CallerStore{
 readonly root:string;readonly url:string;private calls=0;private readBytes=0;
 constructor(private env:Env,private token:string){const project=env.NEXT_PUBLIC_FIREBASE_PROJECT_ID||'',database=env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID||'(default)';if(!/^[a-z0-9-]{6,100}$/.test(project)||!/^[A-Za-z0-9_()-]{1,100}$/.test(database))throw new BackupError('Website chưa có cấu hình Firebase.');this.root=`projects/${project}/databases/${database}/documents`;const host=env.FIRESTORE_EMULATOR_HOST;const local=env.NODE_ENV!=='production'&&project.startsWith('demo-')&&host&&/^127\.0\.0\.1:\d+$/.test(host);this.url=(local?'http://'+host:'https://firestore.googleapis.com')+'/v1/'+this.root;}
 async call(suffix:string,method='GET',body?:unknown):Promise<any>{
  if(++this.calls>5000)throw new BackupError('Dữ liệu vượt giới hạn xuất. Vui lòng liên hệ quản trị.',413);
  const response=await fetch(this.url+suffix,{method,headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(response.status===404)return null;if(!response.ok)throw new BackupError(response.status===401?'Phiên đăng nhập đã hết hạn. Vui lòng tải lại.':'Chưa đọc được dữ liệu sao lưu. Vui lòng thử lại.',response.status===401?401:503);
  const reader=response.body?.getReader();if(!reader)throw new BackupError('Chưa đọc được dữ liệu sao lưu. Vui lòng thử lại.');const parts:Uint8Array[]=[];let size=0;
  try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;this.readBytes+=item.value.length;if(size>20_000_000||this.readBytes>50_000_000)throw new BackupError('Dữ liệu vượt giới hạn xuất. Vui lòng liên hệ quản trị.',413);parts.push(item.value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
 }
 async get(path:string){const d=await this.call('/'+path);return d?decodeFields(d.fields||{}):null;}
 async list(path:string,max:number):Promise<Document[]>{const all:Document[]=[];let page='';do{const result=await this.call('/'+path+'?pageSize=1000'+(page?'&pageToken='+encodeURIComponent(page):''));all.push(...(result?.documents||[]));if(all.length>max)throw new BackupError('Dữ liệu vượt giới hạn xuất. Vui lòng liên hệ quản trị.',413);page=result?.nextPageToken||'';}while(page);return all;}
 async owned(collectionId:string,field:string,uid:string,max:number,parent=''):Promise<Document[]>{const data=await this.call((parent?'/'+parent:'')+':runQuery','POST',{structuredQuery:{from:[{collectionId}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:{stringValue:uid}}},limit:max+1}});const documents=(data||[]).flatMap((v:{document?:Document})=>v.document?[v.document]:[]);if(documents.length>max)throw new BackupError('Dữ liệu vượt giới hạn xuất. Vui lòng liên hệ quản trị.',413);return documents;}
}
async function caller(request:Request,env:Env){const token=request.headers.get('Authorization')?.replace(/^Bearer /i,'')||'',projectId=env.NEXT_PUBLIC_FIREBASE_PROJECT_ID||'',apiKey=env.NEXT_PUBLIC_FIREBASE_API_KEY||'';const uid=await verifyStatisticsViewer(token,{projectId,apiKey,authHost:env.NODE_ENV!=='production'?env.FIREBASE_AUTH_EMULATOR_HOST:undefined});return {uid,token,store:new CallerStore(env,token)};}
function failure(error:unknown){if(error instanceof StatisticsAccessError||error instanceof BackupError)return json({error:error.message},error.status);return json({error:'Chưa xác minh được bản sao lưu. Vui lòng thử lại.'},503);}
async function smallBody(request:Request,max:number){const reader=request.body?.getReader();if(!reader)return '';let size=0;const parts:Uint8Array[]=[];for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>max){await reader.cancel().catch(()=>{});throw new BackupError('Yêu cầu xác minh chưa hợp lệ.',400);}parts.push(part.value);}return Buffer.concat(parts).toString('utf8');}
export async function exportBackupApi(request:Request,env:Env=process.env):Promise<Response>{
 try{
  const {uid,token,store}=await caller(request,env);if(Number(request.headers.get('Content-Length')||0)>0||await smallBody(request,1)!=='')throw new BackupError('API xuất không nhận nội dung file từ trình duyệt.',400);
  const service=await backupServiceStore(env);
  const [profile,details,days,transfers,sources,activity]=await Promise.all([store.get('userProfiles/'+uid),store.get('personalDetails/'+uid),store.list('days',3000),store.owned('creditTransfers','ownerId',uid,50000),store.owned('creditSources','ownerId',uid,20000),store.owned('activityLogs','actorId',uid,100000)]);
  const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8')),companyId=String(details?.companyId||''),departmentId=String(details?.departmentId||'');
  const catalog=async(kind:string,id:string)=>/^[A-Za-z0-9_-]{1,100}$/.test(id)?store.get(kind+'/'+id):null;
  const [company,department]=await Promise.all([catalog('companies',companyId),catalog('departments',departmentId)]);
  const orders:BackupOrder[]=[];for(let i=0;i<days.length;i+=6){const groups=await Promise.all(days.slice(i,i+6).map(async day=>{const id=day.name.split('/').at(-1)!;const owned=await store.owned('orders','ownerId',uid,20000,'days/'+id);return Promise.all(owned.map(async order=>{const orderId=order.name.split('/').at(-1)!,events=await store.list('days/'+id+'/orders/'+orderId+'/financialEvents',10000);return {dayId:id,orderId,date:String(decodeFields(day.fields||{}).date),order:decodeFields(order.fields||{}),financialEvents:events.map(row)};}));}));orders.push(...groups.flat());if(orders.length>20000)throw new BackupError('Dữ liệu vượt giới hạn xuất. Vui lòng liên hệ quản trị.',413);}
  const exportedAt=new Date().toISOString(),exportId=randomUUID().replaceAll('-',''),google=claims.firebase?.sign_in_provider==='google.com';
  const backup:PersonalBackup={format:'lunch-together.personal-data',version:2,exportId,exportedAt,sourceUserId:uid,profile:{preferredName:String(profile?.preferredName||profile?.displayName||claims.name||''),phone:String(details?.phone||''),jobTitle:String(details?.jobTitle||''),companyId,departmentId,email:google?String(claims.email||''):'',google,hasDetails:!!details},affiliation:{company:company?{id:companyId,name:company.name,active:company.active}:null,department:department?{id:departmentId,name:department.name,active:department.active,companyId:department.companyId}:null},orders:orders.sort((a,b)=>a.dayId.localeCompare(b.dayId)||a.orderId.localeCompare(b.orderId)),creditTransfers:transfers.map(row),creditSources:sources.map(row),activity:activity.map(row)};
  const raw=JSON.stringify(backup,null,2),bytes=Buffer.byteLength(raw,'utf8');if(bytes>MAX_BACKUP_BYTES)throw new BackupError('File sao lưu tối đa 10 MB.',413);parsePersonalBackup(raw);
  await service.store.call(':commit','POST',{writes:[service.store.create('personalExports/'+exportId,{ownerId:{stringValue:uid},fileHash:{stringValue:sha(raw)},bytes:{integerValue:String(bytes)},formatVersion:{integerValue:'2'},exportedAt:{stringValue:exportedAt},orderCount:{integerValue:String(orders.length)},createdBy:{stringValue:service.uid}})]});
  // Audit is best effort after the mandatory immutable registry commit. Never log raw files or credentials.
  try{await store.call(':commit','POST',{writes:[{update:{name:store.root+'/activityLogs/'+randomUUID().replaceAll('-',''),fields:{kind:{stringValue:'export.personal'},actorId:{stringValue:uid},source:{stringValue:'app'},summary:{stringValue:'Xuất dữ liệu cá nhân'},dayId:{stringValue:''},orderId:{stringValue:''},reference:{stringValue:''},details:{stringValue:JSON.stringify({exportId,orderCount:orders.length,activityCount:activity.length})}}},currentDocument:{exists:false},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]}]});}catch{console.warn('[personal-backup] audit_failed');}
  const data=new TextEncoder().encode(raw);let offset=0;const body=new ReadableStream<Uint8Array>({pull(controller){if(offset>=data.length){controller.close();return;}controller.enqueue(data.slice(offset,offset+65536));offset+=65536;}});
  return new Response(body,{headers:{...headers,'Content-Type':'application/json;charset=utf-8','Content-Disposition':'attachment; filename="lunch-together-personal-'+exportedAt.slice(0,10)+'.json"'}});
 }catch(error){return failure(error);}
}
export async function verifyBackupApi(request:Request,env:Env=process.env):Promise<Response>{
 try{
  await caller(request,env);if(Number(request.headers.get('Content-Length')||0)>2048)throw new BackupError('Yêu cầu xác minh chưa hợp lệ.',400);const raw=await smallBody(request,2048);let input;try{input=JSON.parse(raw);}catch{throw new BackupError('Yêu cầu xác minh chưa hợp lệ.',400);}
  if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['exportId','fileHash','bytes','sourceUserId'].includes(k))||typeof input.exportId!=='string'||typeof input.fileHash!=='string'||typeof input.sourceUserId!=='string'||!(/^[a-f0-9]{32}$/).test(input.exportId)||!(/^[a-f0-9]{64}$/).test(input.fileHash)||!(/^[A-Za-z0-9_-]{1,128}$/).test(input.sourceUserId)||!Number.isInteger(input.bytes)||input.bytes<1||input.bytes>MAX_BACKUP_BYTES)throw new BackupError('Yêu cầu xác minh chưa hợp lệ.',400);
  const service=await backupServiceStore(env),document=await service.store.get('personalExports/'+input.exportId),value=document?decodeFields(document.fields as Record<string,Value>):null;
  if(!value||value.ownerId!==input.sourceUserId||value.bytes!==input.bytes||value.formatVersion!==2||typeof value.fileHash!=='string'||!(/^[a-f0-9]{64}$/).test(value.fileHash)||!timingSafeEqual(Buffer.from(value.fileHash),Buffer.from(input.fileHash)))return json({error:mismatch},422);
  return json({verified:true});
 }catch(error){return failure(error);}
}
