'use client';
import {useI18n} from '../components/i18n-provider';
import {orderFinance,moneyFields} from '../lib/order-finance';
import type {Order} from '../lib/types';
export default function OrderEditFinance({order,price,quantity}:{order:Order;price:number;quantity:number}){
 const {t,money}=useI18n(),f=orderFinance({...order,...moneyFields(order),price,quantity,cancelled:false});
 if(!f.receivedAmount&&!f.creditInAmount)return null;
 return <div className="edit-finance"><strong>{t('Đối soát sau thay đổi')}</strong>{f.creditInAmount>0?<p>{t('Đã dùng số dư: ')}{money(f.creditInAmount)}</p>:null}<p>{t('Đã nhận: ')}{money(f.receivedAmount)}{f.refundedAmount>0?<> · {t('Đã hoàn: ')}{money(f.refundedAmount)}</>:null}</p>{f.due>0?<p>{t('Cần trả thêm: ')}<b>{money(f.due)}</b></p>:f.refundDue>0?<p>{t('Cần hoàn: ')}<b>{money(f.refundDue)}</b></p>:<p>{t('Đã thanh toán đủ, không cần chuyển thêm.')}</p>}</div>;
}
