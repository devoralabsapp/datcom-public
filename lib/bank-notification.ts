export class NotificationError extends Error{}
export type BankNotification={reference:string;amount:number;accountNumber:string;bankBin:string;transactionId:string;occurredAt:string};
function uniqueField(text:string,labels:string){
 const expression=new RegExp('(?:^|\\n)\\s*(?:'+labels+')\\s*:\\s*([^\\n]+)','giu');
 const values=[...text.matchAll(expression)].map(m=>m[1].trim());
 if(values.length!==1)throw new NotificationError('Thông báo thiếu hoặc trùng trường bắt buộc.');return values[0];
}
export function parseBankNotification(raw:string):BankNotification{
 if(typeof raw!=='string'||!raw.trim()||raw.length>12000)throw new NotificationError('Thông báo trống hoặc quá dài.');
 // Some mobile automations flatten line breaks. Restore boundaries only at
 // known bank labels; duplicates then fail the same strict field checks.
 const text=raw.normalize('NFC').replace(/\r\n?/g,'\n').replace(/(Transaction (?:Time|Amount|Details?|Code)|Details?|Nội dung|Noi dung|Ending Balance|Số dư|So du|Account(?: thanh toán)?|Số tiền(?: giao dịch)?|So tien(?: giao dich)?|Tài khoản(?: thanh toán)?|Tai khoan(?: thanh toan)?|Mã giao dịch|Ma giao dich|Mã GD|Ma GD|Thời gian(?: giao dịch)?|Thoi gian(?: giao dich)?)\s*:/giu,'\n$&');
 const refs=[...new Set(text.toUpperCase().match(/\bCOM[A-F0-9]{20}\b/g)||[])];
 if(refs.length!==1)throw new NotificationError('Không tìm thấy một mã đơn duy nhất trong thông báo.');
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
