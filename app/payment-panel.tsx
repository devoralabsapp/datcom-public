'use client';
import {useI18n} from '../components/i18n-provider';
import {useEffect,useRef,useState} from 'react';
import {doc,onSnapshot} from 'firebase/firestore';
import {Copy,Download,LoaderCircle,CheckCheck,Save,Unplug} from 'lucide-react';
import type {MealClient} from '../lib/meal-client';
import type {Workspace} from '../lib/types';
import {friendlyFirebaseError} from '../lib/firebase-client';
import {isBankAccount,vietQrPayload,type BankAccount,type PaymentIntent} from '../lib/payment-model';
import {createPaymentIntegration,paymentIntegrations,requestPayment,revokePaymentIntegration,saveBankAccount} from '../lib/payment-client';
import {PRIMARY_ADMIN_UID} from '../lib/user-model';
import banks from '../data/banks.json';
import GroupPaymentPanel from './group-payment-panel';
import type {PaymentTarget} from '../lib/payment-group';

const empty:BankAccount={bankBin:'970418',bankName:'BIDV',accountNumber:'',accountName:''};
async function copy(value:string){await navigator.clipboard.writeText(value);}

export default function PaymentPanel(props:{workspace:Workspace;client:MealClient;onChanged:()=>void;target?:PaymentTarget|null}){
 return props.target?<GroupPaymentPanel client={props.client} target={props.target} onChanged={props.onChanged}/>:<SinglePaymentPanel {...props}/>;
}
function SinglePaymentPanel({workspace:w,client,onChanged}:{workspace:Workspace;client:MealClient;onChanged:()=>void}){
 const {t,money,intlLocale}=useI18n();
 const orders=w.orders.filter(o=>!o.cancelled&&!o.paid&&(w.admin||o.actor===w.userId));
 const [orderId,setOrderId]=useState(()=>orders.find(o=>o.actor===w.userId)?.id||orders[0]?.id||'');
 const [bank,setBank]=useState<BankAccount>(),[legacy,setLegacy]=useState(w.paymentUrl||''),[version,setVersion]=useState(''),[draft,setDraft]=useState<BankAccount>(empty);
 const [intent,setIntent]=useState<PaymentIntent>(),[qr,setQr]=useState(''),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[paid,setPaid]=useState(false);
 const dirty=useRef(false),changed=useRef(onChanged);changed.current=onChanged;
 const hasBank=!!bank;
 useEffect(()=>onSnapshot(doc(client.db,'settings','payment'),snapshot=>{const data=snapshot.data();setBank(isBankAccount(data)?data:undefined);setLegacy(typeof data?.qrUrl==='string'?data.qrUrl:'');setVersion(String(data?.updatedAt?.toMillis?.()||''));if(isBankAccount(data)&&!dirty.current)setDraft({bankBin:data.bankBin,bankName:data.bankName,accountNumber:data.accountNumber,accountName:data.accountName});},e=>setError(friendlyFirebaseError(e))),[client]);
 useEffect(()=>{
  let active=true;setIntent(undefined);setQr('');setError('');setPaid(false);setLoading(false);
  if(!orderId||!hasBank)return;
  setLoading(true);
  void requestPayment(client,w.day.id,orderId).then(async value=>{const renderer=await import('qrcode');const image=await renderer.toDataURL(vietQrPayload(value,value.amount,value.description),{width:360,margin:4,errorCorrectionLevel:'M'});if(active){setIntent(value);setQr(image);}}).catch(e=>{if(active)setError(friendlyFirebaseError(e));}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 // Settings version changes invalidate a QR even if its displayed fields match.
 },[client,w.day.id,orderId,version,hasBank]);
 useEffect(()=>{
  if(!intent)return;
  let confirmed=false;
  return onSnapshot(doc(client.db,'days',intent.dayId,'orders',intent.orderId),snapshot=>{
   const order=snapshot.data();
   if(order?.paid===true){confirmed=true;setPaid(true);setQr('');changed.current();return;}
   if(confirmed||!order||order.cancelled||order.ownerId!==intent.ownerId||order.dishId!==intent.dishId||order.price!==intent.price||order.quantity!==intent.quantity){setPaid(false);setQr('');setError('Đơn đã thay đổi. Đóng và mở lại thông tin thanh toán để tạo QR mới.');}
  },e=>setError(friendlyFirebaseError(e)));
 },[client,intent]);
 useEffect(()=>{if(!intent||paid)return;const timer=setTimeout(()=>{setQr('');setError('QR đã hết hạn. Đóng và mở lại để tạo QR mới.');},Math.max(0,Date.parse(intent.expiresAt)-Date.now()));return()=>clearTimeout(timer);},[intent,paid]);
 async function save(e:React.FormEvent){e.preventDefault();if(saving)return;setSaving(true);setError('');try{await saveBankAccount(client,draft);dirty.current=false;setMessage('Đã lưu tài khoản nhận tiền.');changed.current();}catch(e){setError(friendlyFirebaseError(e));}finally{setSaving(false);}}
 function edit(field:keyof BankAccount,value:string){dirty.current=true;setDraft(prev=>({...prev,[field]:value}));}
 const unavailable=!orders.length;
 return <div className="bank-payment-panel">
  <span className="eyebrow">{t("THANH TOÁN TIỀN CƠM")}</span><h2 id="modal-title">{t("Thông tin chuyển khoản")}</h2>
  {error?<div className="error-banner" role="alert">{t(error)}</div>:null}{message?<p className="bank-success" role="status">{t(message)}</p>:null}
  {bank?<>
   <dl className="bank-payee"><div><dt>{t("Ngân hàng")}</dt><dd>{bank.bankName}</dd></div><div><dt>{t("Số tài khoản")}</dt><dd><strong>{bank.accountNumber}</strong><button className="icon-btn" aria-label={t("Sao chép số tài khoản")} onClick={()=>copy(bank.accountNumber).then(()=>setMessage('Đã sao chép số tài khoản.')).catch(()=>setError('Chưa sao chép được.'))}><Copy size={15}/></button></dd></div><div><dt>{t("Người nhận")}</dt><dd>{bank.accountName}</dd></div></dl>
   {!paid&&orders.length?<><label htmlFor="payment-order">{t("Chọn đơn cần thanh toán")}</label><select id="payment-order" value={orderId} onChange={e=>setOrderId(e.target.value)}>{orders.map(order=><option key={order.id} value={order.id}>{order.name} · {order.dish} {"×"} {order.quantity} · {money(order.price*order.quantity)}</option>)}</select></>:!paid?<p className="payment-warning">{t("Bạn chưa có đơn cần thanh toán trong ngày đang chọn.")}</p>:null}
   {loading?<p role="status"><LoaderCircle className="spin" size={16}/>{t(" Đang tạo QR cho đơn cơm…")}</p>:null}
   {paid?<><div className="bank-success" role="status"><CheckCheck size={20}/>{t(" Đơn đã được xác nhận thanh toán.")}</div>{orders.length?<button className="outline-btn" onClick={()=>setOrderId(orders[0].id)}>{t("Thanh toán đơn khác")}</button>:null}</>:null}
   {qr&&intent&&!paid?<><p className="bank-amount">{money(intent.amount)}</p><img className="payment-qr" src={qr} alt={t("QR chuyển ")+money(intent.amount)+t(' cho ')+bank.accountName}/><div className="bank-transfer-note"><span>{t("Nội dung chuyển khoản")}</span><strong>{intent.description}</strong><small>{t("Đơn của ")}{intent.name} · {w.day.date.slice(8)}/{w.day.date.slice(5,7)}</small></div><div className="bank-qr-actions"><button className="primary" onClick={()=>copy(intent.description).then(()=>setMessage('Đã sao chép nội dung chuyển khoản.')).catch(()=>setError('Chưa sao chép được.'))}><Copy size={15}/>{t(" Sao chép nội dung")}</button><a className="outline-btn" href={qr} download={'tien-com-'+intent.reference+'.png'}><Download size={15}/>{t(" Lưu QR")}</a></div><small className="payment-warning">{t("Giữ nguyên số tiền và mã đơn khi chuyển. QR hết hạn lúc ")}{new Date(intent.expiresAt).toLocaleString(intlLocale,{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})}{t("; trạng thái tự cập nhật sau khi hệ thống nhận và đối chiếu thông báo ngân hàng. Bạn cũng có thể liên hệ người gom cơm để xác nhận.")}</small></>:null}
   {unavailable&&!paid?<small className="payment-warning">{t("Thông tin trên dùng để chuyển khoản thủ công. Để tự đối chiếu, cần QR riêng của một đơn chưa trả.")}</small>:null}
  </>:legacy?<><img className="payment-qr" src={legacy} alt={t("Mã QR thanh toán đã cấu hình")}/><p className="payment-warning">{t("QR cũ chỉ hỗ trợ chuyển khoản thủ công. Quản trị viên có thể nhập tài khoản bên dưới để tạo QR theo đơn.")}</p></>:<p className="payment-warning">{w.admin?t("Nhập tài khoản nhận tiền bên dưới để tạo QR."):t("Chưa cấu hình tài khoản nhận tiền. Vui lòng liên hệ người gom cơm.")}</p>}
  {w.admin?<details className="bank-admin-settings" open={!bank&&!legacy}><summary>{t("Cài đặt tài khoản nhận tiền")}</summary><form onSubmit={save}><label htmlFor="payee-bank">{t("Ngân hàng")}</label><select id="payee-bank" value={draft.bankBin} onChange={e=>{const selected=banks.find(b=>b.bin===e.target.value);dirty.current=true;setDraft(prev=>({...prev,bankBin:e.target.value,bankName:selected?.shortName||selected?.name||''}));}}>{banks.map(b=><option key={b.bin} value={b.bin}>{b.shortName} · {b.bin}</option>)}</select><label htmlFor="payee-account">{t("Số tài khoản nhận tiền")}</label><input id="payee-account" autoComplete="off" required maxLength={34} pattern="[A-Za-z0-9]+" value={draft.accountNumber} onChange={e=>edit('accountNumber',e.target.value)} placeholder={t("Nhập số tài khoản")}/><label htmlFor="payee-name">{t("Tên người nhận")}</label><input id="payee-name" autoComplete="off" required maxLength={70} value={draft.accountName} onChange={e=>edit('accountName',e.target.value)} placeholder={t("Tên chủ tài khoản")}/><p className="input-hint">{t("Kiểm tra đúng người nhận trong ứng dụng ngân hàng khi quét thử. Đổi tài khoản sẽ làm QR cũ ngừng tự đối chiếu.")}</p><button className="primary" disabled={saving}>{saving?<LoaderCircle className="spin" size={16}/>:<Save size={16}/>}{t(" Lưu tài khoản")}</button></form></details>:null}
  {w.admin&&w.userId===PRIMARY_ADMIN_UID?<ShortcutSetup client={client}/>:null}
 </div>;
}

function ShortcutSetup({client}:{client:MealClient}){
 const {t}=useI18n();
 const [setup,setSetup]=useState<Awaited<ReturnType<typeof createPaymentIntegration>>>(),[list,setList]=useState<{uid:string;enabled:boolean}[]>([]),[pending,setPending]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function action(work:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await work();}catch(e){if(alive.current)setError(friendlyFirebaseError(e));}finally{if(alive.current)setBusy(false);}}
 const environment=setup?`PAYMENT_WEBHOOK_SECRET=${setup.secret}\nPAYMENT_FIREBASE_REFRESH_TOKEN=${setup.refreshToken}`:'';
 return <details className="bank-admin-settings"><summary>{t("Kết nối Shortcut nhận tiền")}</summary><p>{t("Hỗ trợ thông báo BIDV và Techcombank. Shortcut gửi nguyên văn thông báo đến ")}<code>/api/payments/bank-notification</code>{t(". Cần số tài khoản nhận đầy đủ, tiền vào (+) và mã COM của QR trong nội dung. Chỉ tên người chuyển chưa đủ để xác nhận đơn.")}</p><p>{t("BIDV cần thời gian và mã giao dịch. Với mẫu Techcombank Account / Amount / Balance, hệ thống dùng dấu nhận diện thông báo để chống gửi trùng và ghi thời điểm API nhận được, vì mẫu này không có giờ hoặc mã giao dịch ngân hàng.")}</p><p>{t("Quản trị chính tạo kết nối riêng cho API, sau đó thêm hai giá trị vào môi trường Production của Vercel và triển khai lại. Không cần OIDC hoặc khóa service account.")}</p>{error?<div className="error-banner" role="alert">{t(error)}</div>:null}{message?<p className="bank-success" role="status">{t(message)}</p>:null}
  <div className="bank-qr-actions"><button className="outline-btn" disabled={busy} onClick={()=>void action(async()=>{const value=await createPaymentIntegration(client);if(alive.current){setSetup(value);setMessage('Đã tạo kết nối. Lưu cấu hình trước khi đóng cửa sổ này.');}})}>{t("Tạo kết nối API")}</button><button className="text-btn" disabled={busy} onClick={()=>void action(async()=>{const rows=await paymentIntegrations(client);if(alive.current)setList(rows);})}>{t("Xem kết nối")}</button></div>
  {setup?<div className="bank-setup-secret"><label htmlFor="payment-environment">{t("Cấu hình máy chủ — chỉ lưu vào Vercel")}</label><textarea id="payment-environment" rows={5} readOnly value={environment} spellCheck={false}/><button className="outline-btn" onClick={()=>void copy(environment).then(()=>setMessage('Đã sao chép cấu hình máy chủ.')).catch(()=>setError('Chưa sao chép được.'))}><Copy size={14}/>{t(" Sao chép cấu hình")}</button><p>{t("Shortcut chỉ dùng khóa ")}<code>PAYMENT_WEBHOOK_SECRET</code>{t(' trong header ')}<code>Authorization: Bearer …</code>{t(". Không gửi refresh token trong Shortcut hoặc thông báo.")}</p><button className="text-btn" onClick={()=>void copy(setup.secret).then(()=>setMessage('Đã sao chép khóa cho Shortcut.')).catch(()=>setError('Chưa sao chép được.'))}>{t("Sao chép riêng khóa Shortcut")}</button><button className="text-btn" onClick={()=>setSetup(undefined)}>{t("Ẩn cấu hình")}</button></div>:null}
  {list.length?<ul className="bank-integrations">{list.map(row=><li key={row.uid}><code>{row.uid}</code><span>{row.enabled?t("Đang bật"):t("Đã ngắt")}</span>{row.enabled?<button className="text-btn" onClick={()=>setPending(row.uid)} disabled={busy}><Unplug size={13}/>{t(" Ngắt")}</button>:null}</li>)}</ul>:null}
  {pending?<div className="bank-revoke"><p>{t("Ngắt kết nối ")}{pending}{t("? Thông báo từ kết nối này sẽ không được xác nhận thanh toán.")}</p><button className="danger-btn" disabled={busy} onClick={()=>void action(async()=>{await revokePaymentIntegration(client,pending);const rows=await paymentIntegrations(client);if(alive.current){setList(rows);setPending('');setMessage('Đã ngắt kết nối API.');}})}>{t("Xác nhận ngắt")}</button><button className="text-btn" disabled={busy} onClick={()=>setPending('')}>{t("Giữ kết nối")}</button></div>:null}
 </details>;
}
