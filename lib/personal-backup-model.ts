import type {PersonalProfile} from './organization';
import {validOrderId,validDate} from './meal-client-model';
import {validUserId} from './user-model';
export const MAX_BACKUP_BYTES=10_000_000,CHUNK_LENGTH=150_000;
export type Row=Record<string,unknown>;
export type BackupOrder={dayId:string;orderId:string;date:string;order:Row;financialEvents:Row[]};
export type PersonalBackup={format:'lunch-together.personal-data';version:1|2;exportId?:string;exportedAt:string;sourceUserId:string;profile:PersonalProfile;affiliation:Row;orders:BackupOrder[];creditTransfers:Row[];creditSources:Row[];activity:Row[]};
export type ImportSummary={id:string;ownerId:string;sourceUid:string;orderCount:number;moneyCount:number;restoredCount:number;skippedCount:number;state:string;createdAt:string|null;reviewNote:string};
export type RestoreResult={id:string;restored:number;existing:number;review:number;skipped:number;reasons:string[]};
const object=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown,max:number)=>typeof value==='string'&&value.length<=max;
const moneyFields=['receivedAmount','refundedAmount','voidedAmount','creditInAmount','creditOutAmount'];
export const requiresMoneyReview=(row:BackupOrder)=>row.order.paid===true||row.financialEvents.length>0||moneyFields.some(key=>Number(row.order[key]||0)>0);
export function parsePersonalBackup(raw:string):PersonalBackup{
 if(new TextEncoder().encode(raw).length>MAX_BACKUP_BYTES)throw new Error('File sao lưu tối đa 10 MB.');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error('File JSON chưa hợp lệ.');}
 if(!object(value)||value.format!=='lunch-together.personal-data'||![1,2].includes(value.version as number)||(value.version===2&&(typeof value.exportId!=='string'||!(/^[a-f0-9]{32}$/).test(value.exportId)))||!text(value.sourceUserId,128)||!validUserId(value.sourceUserId as string)||!text(value.exportedAt,40)||!Number.isFinite(Date.parse(value.exportedAt as string))||!object(value.profile)||!object(value.affiliation))throw new Error('File không đúng định dạng sao lưu cá nhân.');
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
