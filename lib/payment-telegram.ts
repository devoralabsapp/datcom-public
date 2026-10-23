import {createHash} from 'node:crypto';
import type {BankNotification} from './bank-notification';

type Env=Record<string,string|undefined>;
export type PaymentLogEvent={
 requestId:string;
 receivedAt:string;
 httpStatus:number;
 result:{status?:string;reason?:string;message?:string;error?:string;reference?:string;amount?:number};
 notification?:string;
 parsed?:Pick<BankNotification,'reference'|'amount'|'bankBin'|'accountNumber'>;
};
const reasons:Record<string,string>={
 unknown_reference:'Không tìm thấy mã đơn',invalid_order:'Đơn chưa hợp lệ',reference_already_processed:'Mã đơn đã xử lý',transaction_already_processed:'Giao dịch đã xử lý',missing_payment_data:'Thiếu dữ liệu thanh toán',amount_mismatch:'Số tiền không khớp',account_mismatch:'Ngân hàng hoặc tài khoản không khớp',payee_changed:'Tài khoản nhận đã thay đổi',qr_replaced:'Mã QR đã được thay thế',qr_expired:'Mã QR đã hết hạn',order_cancelled:'Đơn đã hủy',already_paid:'Đơn đã được thanh toán',order_changed:'Thông tin đơn đã thay đổi',transaction_time_mismatch:'Thời điểm giao dịch không khớp',notification_not_supported:'Chưa đọc được thông báo'
};
const titles:Record<string,string>={paid:'ĐÃ XÁC NHẬN THANH TOÁN',duplicate:'THÔNG BÁO GỬI TRÙNG',unmatched:'CHƯA XÁC NHẬN THANH TOÁN'};
const short=(text:string,length:number)=>Array.from(text).slice(0,length).join('');
function conceal(value:string){return value.length>4?'***'+value.slice(-4):'***';}
function redact(text:string,env:Env){
 let value=text.normalize('NFC');
 // Never echo configured credentials, including in a malformed notification.
 for(const key of ['PAYMENT_WEBHOOK_SECRET','PAYMENT_FIREBASE_REFRESH_TOKEN','PAYMENT_TELEGRAM_BOT_TOKEN'])if(env[key])value=value.split(env[key]!).join('[đã che khóa]');
 return value.replace(/(?:Bearer\s+[A-Za-z0-9._~+/-]+=*|\b\d{5,20}:[A-Za-z0-9_-]{20,100}\b)/gi,'[đã che khóa]')
  .replace(/((?:Ending Balance|Balance|Số dư|So du)\s*:\s*)[+-]?\s*\d[\d,. \t]*(?:VND|VNĐ|₫|đ)?/giu,'$1[đã che số dư]')
  .replace(/((?:Account(?: thanh toán)?|Tài khoản(?: thanh toán)?|Tai khoan(?: thanh toan)?)\s*:?\s*)([A-Za-z0-9*]{1,34})/giu,(_,label:string,account:string)=>label+conceal(account))
  .replace(/\b\d{6,}\b/g,value=>conceal(value))
  .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,'');
}
export function paymentLogMessage(event:PaymentLogEvent,env:Env={}){
 const {result,parsed}=event,date=new Date(event.receivedAt);
 const time=Number.isFinite(date.getTime())?new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'medium'}).format(date):'Không rõ';
 const reference=parsed?.reference||result.reference;
 const lines=['CƠM NHÀ · '+(titles[result.status||'']||'LỖI NHẬN THÔNG BÁO'),`Lúc nhận: ${time} (Việt Nam)`,`HTTP: ${event.httpStatus}`,`Yêu cầu: ${short(event.requestId,80)}`];
 if(reference&&/^COM[A-F0-9]{20}$/.test(reference))lines.push('Mã đơn: '+reference);
 const amount=parsed?.amount??result.amount;if(typeof amount==='number'&&Number.isSafeInteger(amount)&&amount>=1000&&amount<=30000000)lines.push('Số tiền: '+amount.toLocaleString('vi-VN')+' đ');
 if(parsed)lines.push('Ngân hàng: '+(parsed.bankBin==='970407'?'Techcombank':parsed.bankBin==='970418'?'BIDV':parsed.bankBin),'Tài khoản: '+conceal(parsed.accountNumber));
 if(result.reason)lines.push('Kết quả: '+(reasons[result.reason]||short(result.reason,80)));
 if(result.message||result.error)lines.push('Chi tiết: '+short(redact(result.message||result.error||'',env),500));
 if(event.notification!==undefined){
  const raw=event.notification;
  const preview=redact(raw,env);
  lines.push('Dấu thông báo: '+createHash('sha256').update(raw).digest('hex').slice(0,16),`Độ dài: ${raw.length} ký tự`,'Nội dung đã che:',short(preview,1200)+(Array.from(preview).length>1200?'\n[đã rút gọn]':''));
 }
 return short(lines.join('\n'),3500);
}
export async function sendPaymentLog(event:PaymentLogEvent,env:Env=process.env,fetcher:typeof fetch=fetch):Promise<'sent'|'disabled'|'failed'>{
 const token=env.PAYMENT_TELEGRAM_BOT_TOKEN||'',chat=env.PAYMENT_TELEGRAM_CHAT_ID||'';
 if((!token&&!chat)||(env.VERCEL_ENV&&env.VERCEL_ENV!=='production'))return 'disabled';
 if(!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token)||!(/^-100\d{5,16}$/.test(chat)||/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(chat))){console.warn('[payment-telegram] invalid_configuration');return 'failed';}
 try{
  const response=await fetcher(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text:paymentLogMessage(event,env),protect_content:true,disable_notification:event.result.status==='duplicate',link_preview_options:{is_disabled:true}}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok){console.warn('[payment-telegram] delivery_failed',{httpStatus:response.status});return 'failed';}
  const body=await response.json();if(body?.ok!==true){console.warn('[payment-telegram] delivery_rejected');return 'failed';}
  return 'sent';
 }catch{console.warn('[payment-telegram] delivery_failed');return 'failed';}
}
