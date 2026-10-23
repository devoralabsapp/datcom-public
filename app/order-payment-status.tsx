'use client';
import {useState} from 'react';
import {collection,getDocs,query,orderBy} from 'firebase/firestore';
import {useI18n} from '../components/i18n-provider';
import type {MealClient} from '../lib/meal-client';
import type {Order} from '../lib/types';
import {orderFinance} from '../lib/order-finance';
import {friendlyFirebaseError} from '../lib/firebase-client';
type Event={id:string;kind:string;time:string;amount:number};
export default function OrderPaymentStatus({order,admin,own,busy,client,onPay,onMutate}:{order:Order;admin:boolean;own:boolean;busy:boolean;client:MealClient;onPay:()=>void;onMutate:(body:Record<string,unknown>,message:string)=>Promise<boolean>}){
 const {t,money,timestamp}=useI18n(),f=orderFinance(order);
 const [confirm,setConfirm]=useState<'receive'|'void'|'refund'|null>(null),[events,setEvents]=useState<Event[]|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 async function commit(){const kind=confirm;if(!kind)return;const ok=await onMutate(kind==='refund'?{action:'refund',id:order.id,amount:f.refundDue}:{action:'paid',id:order.id,paid:kind==='receive'},kind==='refund'?'Đã ghi nhận hoàn tiền.':'Đã cập nhật thanh toán.');if(ok){setConfirm(null);setEvents(null);}}
 async function history(){if(loading)return;setLoading(true);setError('');try{const result=await getDocs(query(collection(client.db,'days',order.dayId,'orders',order.id,'financialEvents'),orderBy('createdAt','desc')));setEvents(result.docs.map(d=>{const v=d.data();return {id:d.id,kind:v.kind,time:v.createdAt.toDate().toISOString(),amount:v.kind==='receive'?v.afterReceived-v.beforeReceived:v.kind==='refund'?v.afterRefunded-v.beforeRefunded:v.afterVoided-v.beforeVoided};}));}catch(e){setError(friendlyFirebaseError(e));}finally{setLoading(false);}}
 return <div className="order-finance"><span className={'paid-pill '+(order.paid?'yes':'no')}>{order.cancelled?t('Đã hủy'):order.paid?t('Đã thanh toán'):t('Chưa thanh toán')}</span>
  {f.receivedAmount>0?<small>{t('Đã nhận: ')}{money(f.receivedAmount)}</small>:null}{f.refundedAmount>0?<small>{t('Đã hoàn: ')}{money(f.refundedAmount)}</small>:null}{f.voidedAmount>0?<small>{t('Đã bỏ xác nhận: ')}{money(f.voidedAmount)}</small>:null}
  {f.due>0&&f.held>0?<strong className="finance-due">{t('Còn thiếu: ')}{money(f.due)}</strong>:null}
  {f.refundDue>0?<strong className="finance-refund">{t('Cần hoàn: ')}{money(f.refundDue)}</strong>:null}{f.creditAvailable>0?<strong className="finance-credit">{t('Giữ cho lần sau: ')}{money(f.creditAvailable)}</strong>:null}
  {f.creditInAmount>0?<small>{t('Đã dùng số dư: ')}{money(f.creditInAmount)}</small>:null}{f.creditOutAmount>0?<small>{t('Đã chuyển số dư: ')}{money(f.creditOutAmount)}</small>:null}
  {f.surplus>0&&(admin||own)?<div className="surplus-choices" role="group" aria-label={t('Xử lý tiền thừa')}><button className="row-pay-button" disabled={busy||f.surplusChoice==='refund'} aria-pressed={f.surplusChoice==='refund'} onClick={()=>void onMutate({action:'surplus',id:order.id,choice:'refund'},'Đã chọn nhận lại tiền thừa.')}>{t('Hoàn lại')}</button><button className="row-pay-button" disabled={busy||f.surplusChoice==='carry'} aria-pressed={f.surplusChoice==='carry'} onClick={()=>void onMutate({action:'surplus',id:order.id,choice:'carry'},'Đã giữ số dư cho lần sau.')}>{t('Để hôm sau')}</button></div>:null}
  {f.due>0&&(admin||own)?<button className="row-pay-button" disabled={busy} onClick={onPay}>{t('Thanh toán')}</button>:null}
  {admin?<div className="finance-admin-actions">{f.refundDue>0?<button className="text-btn" disabled={busy} onClick={()=>setConfirm('refund')}>{t('Xác nhận đã hoàn')}</button>:null}{f.due>0?<button className="text-btn" disabled={busy} onClick={()=>setConfirm('receive')}>{t('Xác nhận đã thu')}</button>:null}{!order.cancelled&&f.held>0&&f.creditInAmount===0?<button className="text-btn" disabled={busy} onClick={()=>setConfirm('void')}>{t('Bỏ xác nhận')}</button>:null}</div>:null}
  {confirm?<div className="finance-confirm" role="group" aria-label={t('Xác nhận đối soát')}><p>{confirm==='refund'?t('Đã hoàn thực tế {0} cho người đặt?',{'0':money(f.refundDue)}):confirm==='receive'?t('Đã nhận thêm {0} từ người đặt?',{'0':money(f.due)}):t('Bỏ xác nhận khoản {0}? Lịch sử vẫn được lưu; đây không phải thao tác hoàn tiền.',{'0':money(f.held)})}</p><button className="outline-btn" disabled={busy} onClick={()=>setConfirm(null)}>{t('Quay lại')}</button><button className="row-pay-button" disabled={busy} onClick={()=>void commit()}>{t('Xác nhận')}</button></div>:null}
  {(f.receivedAmount>0||events)?<details onToggle={e=>{if(e.currentTarget.open&&events===null)void history();}}><summary>{t('Lịch sử đối soát thủ công')}</summary>{loading?<small>{t('Đang tải…')}</small>:events?.length?<ul>{events.map(e=><li key={e.id}><span>{t(e.kind==='receive'?'Xác nhận thu':e.kind==='refund'?'Xác nhận hoàn':'Bỏ xác nhận')} · {money(e.amount)}</span><small>{timestamp(e.time)}</small></li>)}</ul>:<small>{t('Chưa có điều chỉnh thủ công.')}</small>}</details>:null}{error?<small role="alert">{t(error)}</small>:null}
 </div>;
}
