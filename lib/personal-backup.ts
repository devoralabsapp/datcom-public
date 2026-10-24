import {collection,doc,getDoc,getDocs,query,where,limit,runTransaction,serverTimestamp,Timestamp} from 'firebase/firestore';
import type {MealClient} from './meal-client';
import {ensureUser} from './firebase-client';
import {appendActivity,recordActivity} from './activity';
import {emptyDetails,readPersonalProfile,readOrganization,savePersonalProfile,timestampText,type PersonalProfile} from './organization';
import {isLocked,nameId,validOrderId,validDate} from './meal-client-model';
import {validUserId} from './user-model';
import {rememberOrderName} from './order-name';

export const MAX_BACKUP_BYTES=10_000_000,CHUNK_LENGTH=150_000;
type Row=Record<string,unknown>;
export type BackupOrder={dayId:string;orderId:string;date:string;order:Row;financialEvents:Row[]};
export type PersonalBackup={format:'lunch-together.personal-data';version:1;exportedAt:string;sourceUserId:string;profile:PersonalProfile;affiliation:Row;orders:BackupOrder[];creditTransfers:Row[];creditSources:Row[];activity:Row[]};
export type ImportSummary={id:string;ownerId:string;sourceUid:string;orderCount:number;moneyCount:number;restoredCount:number;skippedCount:number;state:string;createdAt:string|null;reviewNote:string};
export type RestoreResult={id:string;restored:number;existing:number;review:number;skipped:number;reasons:string[]};
const object=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown,max:number)=>typeof value==='string'&&value.length<=max;
const moneyFields=['receivedAmount','refundedAmount','voidedAmount','creditInAmount','creditOutAmount'];
export const requiresMoneyReview=(row:BackupOrder)=>row.order.paid===true||row.financialEvents.length>0||moneyFields.some(key=>Number(row.order[key]||0)>0);
function jsonValue(value:unknown):unknown{if(value instanceof Timestamp)return value.toDate().toISOString();if(Array.isArray(value))return value.map(jsonValue);if(object(value))return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,jsonValue(v)]));return value;}
function dataRow(id:string,data:Row):Row{return {id,...jsonValue(data) as Row};}
export function parsePersonalBackup(raw:string):PersonalBackup{
 if(new TextEncoder().encode(raw).length>MAX_BACKUP_BYTES)throw new Error('File sao lưu tối đa 10 MB.');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error('File JSON chưa hợp lệ.');}
 if(!object(value)||value.format!=='lunch-together.personal-data'||value.version!==1||!text(value.sourceUserId,128)||!validUserId(value.sourceUserId as string)||!text(value.exportedAt,40)||!Number.isFinite(Date.parse(value.exportedAt as string))||!object(value.profile)||!object(value.affiliation))throw new Error('File không đúng định dạng sao lưu cá nhân.');
 const profile=value.profile;
 if(!text(profile.preferredName,100)||!text(profile.phone,30)||!/^[-+()0-9 .]*$/.test(profile.phone as string)||!text(profile.jobTitle,100)||!text(profile.companyId,100)||!text(profile.departmentId,100)||!text(profile.email,254)||typeof profile.google!=='boolean')throw new Error('Hồ sơ trong file chưa hợp lệ.');
 if(!Array.isArray(value.orders)||value.orders.length>20000||!Array.isArray(value.activity)||value.activity.length>100000||!Array.isArray(value.creditTransfers)||value.creditTransfers.length>50000||!Array.isArray(value.creditSources)||value.creditSources.length>20000)throw new Error('Dữ liệu trong file vượt giới hạn cho phép.');
 const keys=new Set<string>();
 for(const row of value.orders){
  if(!object(row)||!text(row.dayId,100)||!/^[-\w]{1,100}$/.test(row.dayId as string)||!text(row.orderId,70)||!validOrderId(row.orderId as string)||!text(row.date,10)||!validDate(row.date as string)||!object(row.order)||!Array.isArray(row.financialEvents)||row.financialEvents.length>10000)throw new Error('Đơn cơm trong file chưa hợp lệ.');
  const o=row.order,key=row.dayId+'~'+row.orderId;
  if(keys.has(key)||o.ownerId!==value.sourceUserId||!text(o.name,100)||!(o.name as string).trim()||!text(o.dish,160)||!(o.dish as string).trim()||!text(o.note,300)||typeof o.paid!=='boolean'||typeof o.cancelled!=='boolean'||!Number.isSafeInteger(o.quantity)||Number(o.quantity)<1||Number(o.quantity)>30||!Number.isSafeInteger(o.price)||Number(o.price)<1000||Number(o.price)>1000000||moneyFields.some(k=>o[k]!==undefined&&(!Number.isSafeInteger(o[k])||Number(o[k])<0||Number(o[k])>10000000000)))throw new Error('Đơn cơm trong file chưa hợp lệ.');
  keys.add(key);
 }
 // Do not accept another person's records hidden among the diagnostic sections.
 if(value.activity.some(row=>!object(row)||row.actorId!==value.sourceUserId)||value.creditTransfers.some(row=>!object(row)||row.ownerId!==value.sourceUserId)||value.creditSources.some(row=>!object(row)||row.ownerId!==value.sourceUserId))throw new Error('File chứa dữ liệu không thuộc chủ bản sao lưu.');
 return value as unknown as PersonalBackup;
}
export async function exportPersonalBackup(client:MealClient):Promise<string>{
 const user=await ensureUser(client.auth),uid=user.uid;
 const [profile,organization,days,transfers,sources,activity]=await Promise.all([readPersonalProfile(client),readOrganization(client),getDocs(collection(client.db,'days')),getDocs(query(collection(client.db,'creditTransfers'),where('ownerId','==',uid))),getDocs(query(collection(client.db,'creditSources'),where('ownerId','==',uid))),getDocs(query(collection(client.db,'activityLogs'),where('actorId','==',uid)))]);
 const orders:BackupOrder[]=[];
 for(let i=0;i<days.docs.length;i+=6){const groups=await Promise.all(days.docs.slice(i,i+6).map(async day=>{const owned=await getDocs(query(collection(client.db,'days',day.id,'orders'),where('ownerId','==',uid)));const rows:BackupOrder[]=[];for(const order of owned.docs){const events=await getDocs(collection(client.db,'days',day.id,'orders',order.id,'financialEvents'));rows.push({dayId:day.id,orderId:order.id,date:day.data().date,order:jsonValue(order.data()) as Row,financialEvents:events.docs.map(e=>dataRow(e.id,e.data()))});}return rows;}));orders.push(...groups.flat());}
 if(client.auth.currentUser?.uid!==uid)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại.');
 const backup:PersonalBackup={format:'lunch-together.personal-data',version:1,exportedAt:new Date().toISOString(),sourceUserId:uid,profile,affiliation:{company:organization.companies.find(c=>c.id===profile.companyId)||null,department:organization.departments.find(d=>d.id===profile.departmentId)||null},orders:orders.sort((a,b)=>a.dayId.localeCompare(b.dayId)||a.orderId.localeCompare(b.orderId)),creditTransfers:transfers.docs.map(d=>dataRow(d.id,d.data())),creditSources:sources.docs.map(d=>dataRow(d.id,d.data())),activity:activity.docs.map(d=>dataRow(d.id,d.data()))};
 const raw=JSON.stringify(backup,null,2);parsePersonalBackup(raw);await recordActivity(client,{kind:'export.personal',summary:'Xuất dữ liệu cá nhân',details:{orderCount:orders.length,activityCount:activity.size}});return raw;
}
async function hashText(raw:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');}
async function restoreUnpaidOrder(client:MealClient,row:BackupOrder):Promise<'restored'|'existing'>{
 const user=await ensureUser(client.auth),o=row.order,personId=await nameId(String(o.name)),dishId=await nameId(String(o.dish));
 if(row.orderId!==personId&&!new RegExp('^'+personId+'_(?:[1-9]|[12][0-9]|30)$').test(row.orderId)||requiresMoneyReview(row)||o.cancelled)throw new Error('Đơn này cần quản trị đối soát.');
 const orderRef=doc(client.db,'days',row.dayId,'orders',row.orderId),personRef=doc(client.db,'days',row.dayId,'orderPeople',personId);
 return runTransaction(client.db,async tx=>{
  const [day,order,person,legacy,dish]=await Promise.all([tx.get(doc(client.db,'days',row.dayId)),tx.get(orderRef),tx.get(personRef),tx.get(doc(client.db,'days',row.dayId,'orders',personId)),tx.get(doc(client.db,'days',row.dayId,'dishes',dishId))]);
  if(order.exists()){if(order.data().ownerId!==user.uid)throw new Error('Đơn đã thuộc người khác. Không ghi đè.');return 'existing';}
  if(!day.exists()||day.data().date!==row.date||isLocked({id:row.dayId,...day.data(),menu:[],source:false} as never))throw new Error('Ngày đã chốt hoặc chưa có thực đơn.');
  if((person.exists()&&person.data().ownerId!==user.uid)||(legacy.exists()&&legacy.data().ownerId!==user.uid))throw new Error('Tên này đã thuộc người khác trong ngày.');
  if(!dish.data()?.active||dish.data()?.name!==o.dish||dish.data()?.price!==o.price)throw new Error('Món hoặc giá đã thay đổi.');
  if(client.auth.currentUser?.uid!==user.uid)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại.');
  if(!person.exists())tx.set(personRef,{name:o.name,ownerId:user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  tx.set(orderRef,{name:o.name,ownerId:user.uid,dish:String(o.dish),dishId,quantity:Number(o.quantity),price:Number(o.price),note:String(o.note),paid:false,cancelled:false,receivedAmount:0,refundedAmount:0,voidedAmount:0,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  appendActivity(tx,client.db,user.uid,{kind:'order.create',summary:'Khôi phục đơn chưa thanh toán',dayId:row.dayId,orderId:row.orderId,details:{dish:o.dish,quantity:o.quantity,price:o.price,note:o.note}});return 'restored';
 });
}
export async function importPersonalBackup(client:MealClient,raw:string):Promise<RestoreResult>{
 const backup=parsePersonalBackup(raw),user=await ensureUser(client.auth),fileHash=await hashText(raw),id=user.uid+'~'+fileHash,ref=doc(client.db,'personalImports',id),chunkCount=Math.ceil(raw.length/CHUNK_LENGTH),bytes=new TextEncoder().encode(raw).length,moneyCount=backup.orders.filter(requiresMoneyReview).length;
 await runTransaction(client.db,async tx=>{const previous=await tx.get(ref);if(!previous.exists())tx.set(ref,{ownerId:user.uid,sourceUid:backup.sourceUserId,fileHash,bytes,chunkCount,orderCount:backup.orders.length,moneyCount,restoredCount:0,skippedCount:0,state:'uploading',reviewedBy:'',reviewNote:'',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});});
 const manifest=await getDoc(ref);
 if(manifest.data()?.state==='uploading'){
  for(let i=0;i<chunkCount;i++){if(client.auth.currentUser?.uid!==user.uid)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại.');const chunkRef=doc(client.db,'personalImports',id,'chunks',String(i)),data=raw.slice(i*CHUNK_LENGTH,(i+1)*CHUNK_LENGTH);await runTransaction(client.db,async tx=>{const existing=await tx.get(chunkRef);if(existing.exists()){if(existing.data().data!==data)throw new Error('Bản nhập đã thay đổi.');}else tx.set(chunkRef,{index:i,data,createdAt:serverTimestamp()});});}
  await runTransaction(client.db,async tx=>{const current=await tx.get(ref);if(current.data()?.state==='uploading')tx.update(ref,{state:'ready',updatedAt:serverTimestamp()});});
 }
 const organization=await readOrganization(client),company=organization.companies.find(c=>c.id===backup.profile.companyId&&c.active),department=organization.departments.find(d=>d.id===backup.profile.departmentId&&d.active&&d.companyId===company?.id);
 if(backup.profile.preferredName.trim()){await savePersonalProfile(client,{...emptyDetails,preferredName:backup.profile.preferredName,phone:backup.profile.phone,jobTitle:backup.profile.jobTitle,companyId:company?.id||'',departmentId:department?.id||''});rememberOrderName(backup.profile.preferredName);}
 const result:RestoreResult={id,restored:0,existing:0,review:moneyCount,skipped:0,reasons:[]};
 for(const row of backup.orders){
  if(requiresMoneyReview(row))continue;
  if(row.order.cancelled){result.skipped++;continue;}
  try{const status=await restoreUnpaidOrder(client,row);result[status==='restored'?'restored':'existing']++;}
  catch(error){if(client.auth.currentUser?.uid!==user.uid)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại.');result.skipped++;if(result.reasons.length<10)result.reasons.push(row.date+' · '+String(row.order.dish)+': '+(error instanceof Error?error.message:'Không thể khôi phục.'));}
 }
 await runTransaction(client.db,async tx=>{const current=await tx.get(ref);if(current.data()?.state==='reviewed')return;tx.update(ref,{state:result.review||result.skipped?'pending':'restored',restoredCount:result.restored+result.existing,skippedCount:result.skipped,updatedAt:serverTimestamp()});appendActivity(tx,client.db,user.uid,{kind:'import.personal',summary:'Nhập bản sao lưu cá nhân',details:{orderCount:backup.orders.length,restored:result.restored,existing:result.existing,review:result.review,skipped:result.skipped}});});
 return result;
}
export async function listPersonalImports(client:MealClient,admin=false):Promise<ImportSummary[]>{
 const user=await ensureUser(client.auth);if(admin&&!await client.isAdmin())throw new Error('Chỉ quản trị được đối soát bản nhập.');
 const snapshot=await getDocs(query(collection(client.db,'personalImports'),admin?where('state','==','pending'):where('ownerId','==',user.uid),limit(100)));
 if(client.auth.currentUser?.uid!==user.uid)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại.');
 return snapshot.docs.map(d=>{const v=d.data();return {id:d.id,ownerId:v.ownerId,sourceUid:v.sourceUid,orderCount:v.orderCount,moneyCount:v.moneyCount,restoredCount:v.restoredCount,skippedCount:v.skippedCount,state:v.state,createdAt:timestampText(v.createdAt),reviewNote:v.reviewNote};}).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
}
export async function readImportedBackup(client:MealClient,id:string){
 const user=await ensureUser(client.auth);if(!/^[-\w]{1,128}~[a-f0-9]{64}$/.test(id))throw new Error('Mã bản nhập chưa hợp lệ.');
 const ref=doc(client.db,'personalImports',id),manifest=await getDoc(ref),data=manifest.data();if(!data||data.state==='uploading')throw new Error('Bản nhập chưa đầy đủ.');
 const chunks=await getDocs(collection(client.db,'personalImports',id,'chunks')),ordered=chunks.docs.map(d=>d.data()).sort((a,b)=>a.index-b.index);
 if(ordered.length!==data.chunkCount||ordered.some((v,i)=>v.index!==i))throw new Error('Bản nhập chưa đầy đủ.');
 const raw=ordered.map(v=>v.data).join('');if(new TextEncoder().encode(raw).length!==data.bytes||await hashText(raw)!==data.fileHash)throw new Error('Bản nhập chưa đầy đủ.');
 const backup=parsePersonalBackup(raw);if(backup.sourceUserId!==data.sourceUid||backup.orders.length!==data.orderCount)throw new Error('Bản nhập đã thay đổi.');if(client.auth.currentUser?.uid!==user.uid)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại.');return raw;
}
export async function acknowledgeImport(client:MealClient,id:string,note:string){
 const user=await ensureUser(client.auth);if(!await client.isAdmin())throw new Error('Chỉ quản trị được đối soát bản nhập.');const reviewNote=note.trim();if(!reviewNote||reviewNote.length>1000)throw new Error('Ghi chú đối soát cần từ 1 đến 1.000 ký tự.');
 await readImportedBackup(client,id);
 await runTransaction(client.db,async tx=>{const ref=doc(client.db,'personalImports',id),current=await tx.get(ref);if(current.data()?.state!=='pending')throw new Error('Bản nhập không còn chờ đối soát.');tx.update(ref,{state:'reviewed',reviewedBy:user.uid,reviewNote,updatedAt:serverTimestamp()});appendActivity(tx,client.db,user.uid,{kind:'import.review',summary:'Đối soát bản nhập cá nhân',details:{targetUid:current.data()?.ownerId,importId:id,note:reviewNote}});});
}
export function downloadPersonalBackup(raw:string){const blob=new Blob([raw],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='lunch-together-personal-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
