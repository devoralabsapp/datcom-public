'use client';
import {CreditCoveredError} from '../lib/credit-client';
import {useEffect,useRef,useState} from 'react';
import {collection,doc,onSnapshot} from 'firebase/firestore';
import {CheckCheck,Copy,Download,LoaderCircle} from 'lucide-react';
import {useI18n} from '../components/i18n-provider';
import type {MealClient} from '../lib/meal-client';
import {friendlyFirebaseError} from '../lib/firebase-client';
import {requestPaymentGroup} from '../lib/payment-group-client';
import type {PaymentGroup,PaymentTarget} from '../lib/payment-group';
import {vietQrPayload} from '../lib/payment-model';

export default function GroupPaymentPanel({client,target,onChanged}:{client:MealClient;target:PaymentTarget;onChanged:()=>void}){
 const {t,money,timestamp}=useI18n();
 const [group,setGroup]=useState<PaymentGroup>(),[qr,setQr]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState(''),[message,setMessage]=useState(''),[settled,setSettled]=useState(0),[covered,setCovered]=useState(false),[received,setReceived]=useState(false),[invalid,setInvalid]=useState(false);
 const controller=useRef<AbortController|null>(null),alive=useRef(true),changed=useRef(onChanged);changed.current=onChanged;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
 const paid=!!group&&settled>=group.count;
 useEffect(()=>{
  if(!group||!received||paid)return;
  let stopped=false,timeout:ReturnType<typeof setTimeout>,delay=5000;
  async function resume(){
   try{const token=await client.auth.currentUser?.getIdToken();if(!token)return;const response=await fetch('/api/payments/groups/'+group!.reference+'/resume',{method:'POST',headers:{Authorization:'Bearer '+token}});if(!response.ok)delay=Math.min(30000,delay*2);}
   catch{delay=Math.min(30000,delay*2);}
   finally{if(!stopped)timeout=setTimeout(()=>void resume(),delay);}
  }
  timeout=setTimeout(()=>void resume(),2500);return()=>{stopped=true;clearTimeout(timeout);};
 },[client,group,received,paid]);
 useEffect(()=>{
  if(!group)return;
  const stop=onSnapshot(doc(client.db,'paymentGroups',group.reference),snapshot=>{const state=snapshot.data()?.state;setReceived(state==='paid');setInvalid(state==='invalid');if(state==='invalid')setQr('');},e=>setError(friendlyFirebaseError(e)));
  const stopItems=onSnapshot(collection(client.db,'paymentGroupSettlements',group.reference,'items'),snapshot=>{setSettled(snapshot.size);if(snapshot.size>=group.count){setQr('');changed.current();}},e=>setError(friendlyFirebaseError(e)));
  return()=>{stop();stopItems();};
 },[client,group]);
 useEffect(()=>{if(!group||received||paid||invalid)return;const timeout=setTimeout(()=>{setQr('');setError('QR đã hết hạn. Đóng và mở lại để tạo QR mới.');},Math.max(0,Date.parse(group.expiresAt)-Date.now()));return()=>clearTimeout(timeout);},[group,received,paid,invalid]);
 async function create(){
  if(busy)return;const abort=new AbortController();controller.current=abort;setBusy(true);setError('');setProgress(0);setMessage('');setInvalid(false);
  try{const value=await requestPaymentGroup(client,target.orders,n=>{if(alive.current)setProgress(n);},abort.signal);if(!alive.current)return;const renderer=await import('qrcode'),image=await renderer.toDataURL(vietQrPayload(value,value.amount,value.reference),{width:360,margin:4,errorCorrectionLevel:'M'});if(alive.current){setGroup(value);setQr(image);}}
  catch(e){if(alive.current){if(e instanceof CreditCoveredError){setCovered(true);setMessage(e.message);changed.current();}else setError(friendlyFirebaseError(e));}}finally{if(alive.current)setBusy(false);}
 }
 async function copy(text:string){try{await navigator.clipboard.writeText(text);setMessage('Đã sao chép nội dung chuyển khoản.');}catch{setError('Chưa sao chép được.');}}
 return <div className="bank-payment-panel group-payment-panel"><span className="eyebrow">{t('THANH TOÁN TIỀN CƠM')}</span><h2 id="modal-title">{t('Thanh toán cho {0}',{'0':target.name})}</h2>
  <p>{t('Gộp {0} dòng món chưa trả trong khoảng thời gian đã chọn.',{'0':target.orders.length})}</p>
  {error?<div className="error-banner" role="alert">{t(error)}</div>:null}{message?<p className="bank-success" role="status">{t(message)}</p>:null}
  {paid?<div className="bank-success" role="status"><CheckCheck size={22}/>{t('Đã thanh toán toàn bộ {0} dòng món.',{'0':group!.count})}</div>:received?<p role="status"><LoaderCircle className="spin" size={17}/>{t('Đã nhận thanh toán, đang cập nhật {0}/{1} đơn.',{'0':settled,'1':group?.count})}</p>:null}
  {invalid?<div className="error-banner" role="alert">{t('Đơn đã thay đổi, QR này không còn dùng được. Đóng cửa sổ và cập nhật danh sách trước khi thử lại.')}</div>:null}
  {!group?<button className="primary" disabled={busy||covered} onClick={()=>void create()}>{busy?<LoaderCircle className="spin" size={17}/>:null}{busy?t('Đang chuẩn bị {0}/{1} đơn…',{'0':progress,'1':target.orders.length}):t('Tạo QR thanh toán {0} dòng món',{'0':target.orders.length})}</button>:<>
   <dl className="bank-payee"><div><dt>{t('Ngân hàng')}</dt><dd>{group.bankName}</dd></div><div><dt>{t('Số tài khoản')}</dt><dd>{group.accountNumber}</dd></div><div><dt>{t('Người nhận')}</dt><dd>{group.accountName}</dd></div></dl>
   <p className="bank-amount">{money(group.amount)}</p>
   {qr&&!paid&&!received&&!invalid?<><img className="payment-qr" src={qr} alt={t('QR thanh toán nhiều đơn')}/><div className="bank-transfer-note"><span>{t('Nội dung chuyển khoản')}</span><strong>{group.reference}</strong></div><div className="bank-qr-actions"><button className="primary" onClick={()=>void copy(group.reference)}><Copy size={15}/>{t('Sao chép nội dung')}</button><a className="outline-btn" href={qr} download={'tien-com-'+group.reference+'.png'}><Download size={15}/>{t('Lưu QR')}</a></div><small className="payment-warning">{t('Giữ nguyên số tiền và mã đơn khi chuyển. QR hết hạn lúc ')}{timestamp(group.expiresAt)}</small></>:null}
   <details className="group-order-details" open><summary>{t('Chi tiết {0} dòng món',{'0':group.count})}</summary><ul>{group.items.map(item=><li key={item.key}><span><strong>{item.dish}</strong><small>{item.date.slice(8)}/{item.date.slice(5,7)}/{item.date.slice(0,4)} · {item.quantity} {t('suất')}</small></span><b>{money(item.amount)}</b></li>)}</ul></details>
  </>}
 </div>;
}
