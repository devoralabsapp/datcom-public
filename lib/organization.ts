import {collection,doc,getDoc,getDocs,runTransaction,serverTimestamp,Timestamp} from 'firebase/firestore';
import type {MealClient} from './meal-client';
import {ensureUser,friendlyFirebaseError} from './firebase-client';
import {appendActivity} from './activity';
import {organizationDefaults} from './organization-defaults';

export type Company={id:string;name:string;active:boolean};
export type Department=Company&{companyId:string};
export type Organization={companies:Company[];departments:Department[];defaultCompanyId:string;defaultDepartmentId:string;configured:boolean};
export type PersonalDetails={companyId:string;departmentId:string;phone:string;jobTitle:string};
export type PersonalProfile=PersonalDetails&{preferredName:string;email:string;google:boolean;hasDetails?:boolean};
export const emptyDetails:PersonalDetails={companyId:'',departmentId:'',phone:'',jobTitle:''};
export function personalError(error:unknown){return (error as {code?:string})?.code==='permission-denied'?'Tính năng hồ sơ và phòng ban chưa được bật trên Firebase. Vui lòng liên hệ quản trị.':friendlyFirebaseError(error);}
export const catalogId=(id:string)=>/^[A-Za-z0-9_-]{1,100}$/.test(id);
export const timestampText=(value:unknown)=>value instanceof Timestamp?value.toDate().toISOString():null;
const clean=(value:string,max:number)=>{const text=value.normalize('NFC').trim();if(text.length>max)throw new Error('Thông tin vượt quá độ dài cho phép.');return text;};
async function adminUser(client:MealClient){const user=await ensureUser(client.auth);if(!await client.isAdmin())throw new Error('Chỉ quản trị được thay đổi phòng ban.');return user;}
export async function readOrganization(client:MealClient):Promise<Organization>{
 const user=await ensureUser(client.auth),[companies,departments,settings]=await Promise.all([getDocs(collection(client.db,'companies')),getDocs(collection(client.db,'departments')),getDoc(doc(client.db,'settings','organization'))]);
 if(client.auth.currentUser?.uid!==user.uid)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại.');
 return {companies:companies.docs.map(d=>({id:d.id,name:String(d.data().name),active:d.data().active===true})).sort((a,b)=>a.name.localeCompare(b.name,'vi')),departments:departments.docs.map(d=>({id:d.id,name:String(d.data().name),companyId:String(d.data().companyId),active:d.data().active===true})).sort((a,b)=>a.name.localeCompare(b.name,'vi')),defaultCompanyId:settings.data()?.defaultCompanyId||'',defaultDepartmentId:settings.data()?.defaultDepartmentId||'',configured:settings.exists()};
}
export async function initializeOrganization(client:MealClient,companyName=organizationDefaults.companyName,departmentName=organizationDefaults.departmentName){
 const user=await adminUser(client),company=clean(companyName,100),department=clean(departmentName,100);if(!company||!department)throw new Error('Nhập tên công ty và phòng ban.');
 const companyRef=doc(collection(client.db,'companies')),departmentRef=doc(collection(client.db,'departments')),settings=doc(client.db,'settings','organization');
 await runTransaction(client.db,async tx=>{if((await tx.get(settings)).exists())throw new Error('Cấu hình đã được tạo. Vui lòng cập nhật danh sách.');const stamp={createdAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:user.uid};tx.set(companyRef,{name:company,active:true,...stamp});tx.set(departmentRef,{name:department,companyId:companyRef.id,active:true,...stamp});tx.set(settings,{defaultCompanyId:companyRef.id,defaultDepartmentId:departmentRef.id,updatedBy:user.uid,updatedAt:serverTimestamp()});appendActivity(tx,client.db,user.uid,{kind:'organization.save',summary:'Khởi tạo công ty và phòng ban',details:{company,department}});});
}
export async function saveOrganizationItem(client:MealClient,kind:'company'|'department',input:{id?:string;name:string;active:boolean;companyId?:string}){
 const user=await adminUser(client),name=clean(input.name,100);if(!name||typeof input.active!=='boolean'||(input.id&&!catalogId(input.id))||(kind==='department'&&!catalogId(input.companyId||'')))throw new Error('Nhập công ty hoặc phòng ban hợp lệ.');
 const ref=input.id?doc(client.db,kind==='company'?'companies':'departments',input.id):doc(collection(client.db,kind==='company'?'companies':'departments'));
 await runTransaction(client.db,async tx=>{const previous=await tx.get(ref);if(kind==='department'){const company=await tx.get(doc(client.db,'companies',input.companyId!));if(!company.exists()||!company.data().active)throw new Error('Công ty đã ngừng sử dụng.');if(previous.exists()&&previous.data().companyId!==input.companyId)throw new Error('Phòng ban cần giữ nguyên công ty.');}
  tx.set(ref,{name,active:input.active,...(kind==='department'?{companyId:input.companyId}:{}),createdAt:previous.data()?.createdAt||serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:user.uid});appendActivity(tx,client.db,user.uid,{kind:'organization.save',summary:kind==='company'?'Cập nhật công ty':'Cập nhật phòng ban',details:{kind,id:ref.id,name,active:input.active,companyId:input.companyId||''}});
 });return ref.id;
}
export async function setOrganizationDefault(client:MealClient,companyId:string,departmentId:string){
 const user=await adminUser(client);if(!catalogId(companyId)||!catalogId(departmentId))throw new Error('Chọn công ty và phòng ban mặc định.');
 await runTransaction(client.db,async tx=>{const [company,department]=await Promise.all([tx.get(doc(client.db,'companies',companyId)),tx.get(doc(client.db,'departments',departmentId))]);if(!company.data()?.active||!department.data()?.active||department.data()?.companyId!==companyId)throw new Error('Công ty và phòng ban không khớp hoặc đã ngừng sử dụng.');tx.set(doc(client.db,'settings','organization'),{defaultCompanyId:companyId,defaultDepartmentId:departmentId,updatedBy:user.uid,updatedAt:serverTimestamp()});appendActivity(tx,client.db,user.uid,{kind:'organization.save',summary:'Đổi phòng ban mặc định',details:{companyId,departmentId}});});
}
export async function readPersonalProfile(client:MealClient):Promise<PersonalProfile>{
 const user=await ensureUser(client.auth),[profile,details]=await Promise.all([getDoc(doc(client.db,'userProfiles',user.uid)),getDoc(doc(client.db,'personalDetails',user.uid))]);if(client.auth.currentUser?.uid!==user.uid)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại.');const value=details.data();return {companyId:String(value?.companyId||''),departmentId:String(value?.departmentId||''),phone:String(value?.phone||''),jobTitle:String(value?.jobTitle||''),preferredName:profile.data()?.preferredName||profile.data()?.displayName||user.displayName||'',email:user.isAnonymous?'':user.email||'',google:!user.isAnonymous,hasDetails:details.exists()};
}
export async function savePersonalProfile(client:MealClient,input:PersonalDetails&{preferredName:string}){
 const user=await ensureUser(client.auth),token=await user.getIdTokenResult(),preferredName=clean(input.preferredName,100),companyId=input.companyId,departmentId=input.departmentId,phone=clean(input.phone,30),jobTitle=clean(input.jobTitle,100);
 if(!preferredName||(!companyId&&departmentId)||(companyId&&!catalogId(companyId))||(departmentId&&!catalogId(departmentId))||!/^[-+()0-9 .]*$/.test(phone))throw new Error('Thông tin cá nhân chưa hợp lệ.');
 if(!user.isAnonymous&&(token.signInProvider!=='google.com'||token.claims.email_verified!==true))throw new Error('Cần xác minh tài khoản Google.');
 const ref=doc(client.db,'userProfiles',user.uid);
 await runTransaction(client.db,async tx=>{const profile=await tx.get(ref);if(companyId){const company=await tx.get(doc(client.db,'companies',companyId));if(!company.data()?.active)throw new Error('Công ty đã ngừng sử dụng.');}if(departmentId){const department=await tx.get(doc(client.db,'departments',departmentId));if(!department.data()?.active||department.data()?.companyId!==companyId)throw new Error('Công ty và phòng ban không khớp hoặc đã ngừng sử dụng.');}if(client.auth.currentUser?.uid!==user.uid)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại.');tx.set(ref,{displayName:preferredName,preferredName,email:user.isAnonymous?'':user.email||'',provider:user.isAnonymous?'anonymous':'google.com',createdAt:profile.data()?.createdAt||serverTimestamp(),lastSeenAt:serverTimestamp()});tx.set(doc(client.db,'personalDetails',user.uid),{companyId,departmentId,phone,jobTitle,updatedAt:serverTimestamp()});appendActivity(tx,client.db,user.uid,{kind:'profile.update',summary:'Cập nhật thông tin cá nhân',details:{preferredName,companyId,departmentId}});});
}
