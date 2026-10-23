import {createHash} from 'node:crypto';

export class NotificationError extends Error{}
export type BankNotification={reference:string;amount:number;accountNumber:string;bankBin:string;transactionId:string;occurredAt:string};
function uniqueField(text:string,labels:string){
 const expression=new RegExp('(?:^|\\n)\\s*(?:'+labels+')\\s*:\\s*([^\\n]+)','giu');
 const values=[...text.matchAll(expression)].map(m=>m[1].trim());
 if(values.length!==1)throw new NotificationError('Thông báo thiếu hoặc trùng trường bắt buộc.');return values[0];
}
export function parseBankNotification(raw:string,receivedAt=new Date()):BankNotification{
 if(typeof raw!=='string'||!raw.trim()||raw.length>12000)throw new NotificationError('Thông báo trống hoặc quá dài.');
 // Some mobile automations flatten line breaks. Restore boundaries only at
 // known bank labels; duplicates then fail the same strict field checks.
 const text=raw.normalize('NFC').replace(/\r\n?/g,'\n').replace(/(Transaction (?:Time|Amount|Details?|Code)|Details?|Nội dung|Noi dung|Ending Balance|Số dư|So du|Account(?: thanh toán)?|Amount|Balance|Số tiền(?: giao dịch)?|So tien(?: giao dich)?|Tài khoản(?: thanh toán)?|Tai khoan(?: thanh toan)?|Mã giao dịch|Ma giao dich|Mã GD|Ma GD|Thời gian(?: giao dịch)?|Thoi gian(?: giao dich)?)\s*:/giu,'\n$&').replace(/\bAccount[ \t]+(?=\d)/giu,'\n$&');
 const refs=[...new Set(text.toUpperCase().match(/\bCOM[A-F0-9]{20}\b/g)||[])];
 if(refs.length!==1)throw new NotificationError('Không tìm thấy một mã đơn duy nhất trong thông báo.');
 // Techcombank's short notification has no bank transaction ID or timestamp.
 // Its synthetic ID fingerprints the notice; occurredAt is API receipt time.
 // An immutable receipt still consumes each exact order reference only once.
 if(/(?:^|\n)\s*Account[ \t]+\d/iu.test(text)){
  if(/Transaction (?:Time|Amount|Code)|BIDV|Mã giao dịch|Ma giao dich|Thời gian|Thoi gian/iu.test(text))throw new NotificationError('Thông báo trộn nhiều định dạng ngân hàng.');
  const accounts=[...text.matchAll(/(?:^|\n)[ \t]*Account[ \t]+([^\n]+)/giu)];
  if(accounts.length!==1||!/^\d{1,34}$/.test(accounts[0][1].trim()))throw new NotificationError('Cần một số tài khoản nhận đầy đủ.');
  const amountText=uniqueField(text,'Amount');
  const match=/^\+\s*((?:\d{1,3}(?:,\d{3})+)|(?:\d{1,3}(?:\.\d{3})+)|\d+)\s*(?:VND|VNĐ|₫|đ)?$/iu.exec(amountText);
  if(!match)throw new NotificationError('Chỉ nhận thông báo Techcombank tiền vào (+), số tiền nguyên VND.');
  const amount=Number(match[1].replace(/[.,]/g,''));
  if(!Number.isSafeInteger(amount)||amount<1000||amount>30000000)throw new NotificationError('Số tiền giao dịch ngoài giới hạn.');
  // Require the supplied bank format, but never treat Balance as payment amount.
  const balance=uniqueField(text,'Balance');
  if(!/^\d[\d,.]*(?:[ \t]*(?:VND|VNĐ|₫|đ))?(?:[ \t]+[^\d\s].*)?$/iu.test(balance))throw new NotificationError('Định dạng thông báo Techcombank chưa hợp lệ.');
  if(!Number.isFinite(receivedAt.getTime()))throw new NotificationError('Thời điểm nhận thông báo chưa hợp lệ.');
  const fingerprint=createHash('sha256').update(raw.normalize('NFC').replace(/\s+/g,' ').trim().toUpperCase()).digest('hex');
  return {reference:refs[0],amount,accountNumber:accounts[0][1].trim(),bankBin:'970407',transactionId:'TCBNOTICE-'+fingerprint,occurredAt:receivedAt.toISOString()};
 }
 const amountText=uniqueField(text,'Transaction Amount|Số tiền(?: giao dịch)?|So tien(?: giao dich)?');
 const match=/^\+\s*((?:\d{1,3}(?:,\d{3})+)|(?:\d{1,3}(?:\.\d{3})+)|\d+)\s*(?:VND|VNĐ|₫|đ)$/iu.exec(amountText);
 if(!match)throw new NotificationError('Chỉ nhận thông báo tiền vào (+), đơn vị VND và số tiền nguyên.');
 const amount=Number(match[1].replace(/[.,]/g,''));
 if(!Number.isSafeInteger(amount)||amount<1000||amount>30000000)throw new NotificationError('Số tiền giao dịch ngoài giới hạn.');
 const accountNumber=uniqueField(text,'Account(?: thanh toán)?|Tài khoản(?: thanh toán)?|Tai khoan(?: thanh toan)?').replace(/\s/g,'');
 if(!/^[A-Za-z0-9]{1,34}$/.test(accountNumber))throw new NotificationError('Cần số tài khoản nhận đầy đủ, không bị che.');
 const transactionId=uniqueField(text,'Transaction Code|Mã giao dịch|Ma giao dich|Mã GD|Ma GD');
 if(!/^[A-Za-z0-9._/-]{1,120}$/.test(transactionId))throw new NotificationError('Mã giao dịch chưa hợp lệ.');
 const time=uniqueField(text,'Transaction Time|Thời gian(?: giao dịch)?|Thoi gian(?: giao dich)?');
 const t=/^(\d{2}):(\d{2})(?::(\d{2}))?\s+(\d{2})\/(\d{2})\/(\d{4})$/.exec(time);
 if(!t)throw new NotificationError('Thời gian cần có dạng HH:mm DD/MM/YYYY.');
 const iso=`${t[6]}-${t[5]}-${t[4]}T${t[1]}:${t[2]}:${t[3]||'00'}+07:00`,date=new Date(iso);
 if(!Number.isFinite(date.getTime())||t[1]>'23'||t[2]>'59'||(t[3]||'00')>'59'||new Date(date.getTime()+7*3600000).toISOString().slice(0,10)!==`${t[6]}-${t[5]}-${t[4]}`)throw new NotificationError('Ngày giờ giao dịch chưa hợp lệ.');
 return {reference:refs[0],amount,accountNumber,bankBin:'970418',transactionId,occurredAt:date.toISOString()};
}
