import {collection,doc,getDoc,getDocs,query,where,limit,runTransaction,serverTimestamp} from 'firebase/firestore';
import type {MealClient} from './meal-client';
import {ensureUser} from './firebase-client';
import {appendActivity} from './activity';
import {emptyDetails,readOrganization,savePersonalProfile,timestampText} from './organization';
import {isLocked,nameId} from './meal-client-model';
import {validUserId} from './user-model';
import {rememberOrderName} from './order-name';

import {MAX_BACKUP_BYTES,CHUNK_LENGTH,parsePersonalBackup,requiresMoneyReview,type BackupOrder,type PersonalBackup,type ImportSummary,type RestoreResult} from './personal-backup-model';
export {MAX_BACKUP_BYTES,CHUNK_LENGTH,parsePersonalBackup,requiresMoneyReview} from './personal-backup-model';
export type {BackupOrder,PersonalBackup,ImportSummary,RestoreResult} from './personal-backup-model';

type BackupRequest=typeof fetch;
async function callBackupApi(client:MealClient,path:string,body:unknown,request:BackupRequest){
 const user=await ensureUser(client.auth),token=await user.getIdToken(),response=await request('/api/personal-backups/'+path,{method:'POST',headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(path==='export'?300000:30000)});
 if(client.auth.currentUser?.uid!==user.uid)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại.');
 if(!response.ok){const message=await response.json().catch(()=>({}));throw new Error(typeof message.error==='string'?message.error:'Chưa xác minh được bản sao lưu. Vui lòng thử lại.');}return response;
}
export async function exportPersonalBackup(client:MealClient,request:BackupRequest=fetch):Promise<string>{const user=await ensureUser(client.auth),response=await callBackupApi(client,'export',undefined,request),raw=await response.text();parsePersonalBackup(raw);if(client.auth.currentUser?.uid!==user.uid)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại.');return raw;}
export async function verifyPersonalBackup(client:MealClient,raw:string,request:BackupRequest=fetch){
 const backup=parsePersonalBackup(raw);if(backup.version!==2||!backup.exportId)throw new Error('Bản sao lưu cũ chưa có hash trên server. Vui lòng xuất lại dữ liệu từ ứng dụng trước khi nhập.');
 const fileHash=await hashText(raw),bytes=new TextEncoder().encode(raw).length,response=await callBackupApi(client,'verify',{exportId:backup.exportId,fileHash,bytes,sourceUserId:backup.sourceUserId},request);if((await response.json()).verified!==true)throw new Error('Chưa xác minh được bản sao lưu. Vui lòng thử lại.');return {backup,fileHash};
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
export async function importPersonalBackup(client:MealClient,raw:string,request:BackupRequest=fetch):Promise<RestoreResult>{
 const user=await ensureUser(client.auth),{backup,fileHash}=await verifyPersonalBackup(client,raw,request);if(client.auth.currentUser?.uid!==user.uid)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại.');const id=user.uid+'~'+fileHash,ref=doc(client.db,'personalImports',id),chunkCount=Math.ceil(raw.length/CHUNK_LENGTH),bytes=new TextEncoder().encode(raw).length,moneyCount=backup.orders.filter(requiresMoneyReview).length;
 await runTransaction(client.db,async tx=>{const previous=await tx.get(ref);if(!previous.exists())tx.set(ref,{ownerId:user.uid,sourceUid:backup.sourceUserId,exportId:backup.exportId,fileHash,bytes,chunkCount,orderCount:backup.orders.length,moneyCount,restoredCount:0,skippedCount:0,state:'uploading',reviewedBy:'',reviewNote:'',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});});
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
export async function readImportedBackup(client:MealClient,id:string,request:BackupRequest=fetch){
 const user=await ensureUser(client.auth);if(!/^[-\w]{1,128}~[a-f0-9]{64}$/.test(id))throw new Error('Mã bản nhập chưa hợp lệ.');
 const ref=doc(client.db,'personalImports',id),manifest=await getDoc(ref),data=manifest.data();if(!data||data.state==='uploading')throw new Error('Bản nhập chưa đầy đủ.');
 const chunks=await getDocs(collection(client.db,'personalImports',id,'chunks')),ordered=chunks.docs.map(d=>d.data()).sort((a,b)=>a.index-b.index);
 if(ordered.length!==data.chunkCount||ordered.some((v,i)=>v.index!==i))throw new Error('Bản nhập chưa đầy đủ.');
 const raw=ordered.map(v=>v.data).join('');if(new TextEncoder().encode(raw).length!==data.bytes||await hashText(raw)!==data.fileHash)throw new Error('Bản nhập chưa đầy đủ.');
 const backup=parsePersonalBackup(raw);if(backup.sourceUserId!==data.sourceUid||backup.orders.length!==data.orderCount)throw new Error('Bản nhập đã thay đổi.');if(backup.version===2){if(backup.exportId!==data.exportId)throw new Error('Bản nhập đã thay đổi.');await verifyPersonalBackup(client,raw,request);}if(client.auth.currentUser?.uid!==user.uid)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại.');return raw;
}
export async function acknowledgeImport(client:MealClient,id:string,note:string,request:BackupRequest=fetch){
 const user=await ensureUser(client.auth);if(!await client.isAdmin())throw new Error('Chỉ quản trị được đối soát bản nhập.');const reviewNote=note.trim();if(!reviewNote||reviewNote.length>1000)throw new Error('Ghi chú đối soát cần từ 1 đến 1.000 ký tự.');
 await readImportedBackup(client,id,request);
 await runTransaction(client.db,async tx=>{const ref=doc(client.db,'personalImports',id),current=await tx.get(ref);if(current.data()?.state!=='pending')throw new Error('Bản nhập không còn chờ đối soát.');tx.update(ref,{state:'reviewed',reviewedBy:user.uid,reviewNote,updatedAt:serverTimestamp()});appendActivity(tx,client.db,user.uid,{kind:'import.review',summary:'Đối soát bản nhập cá nhân',details:{targetUid:current.data()?.ownerId,importId:id,note:reviewNote}});});
}
export function downloadPersonalBackup(raw:string){const blob=new Blob([raw],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='lunch-together-personal-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
