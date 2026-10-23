'use client';
import {ArrowUpRight} from 'lucide-react';
import {useI18n} from '../components/i18n-provider';
import type {Order} from '../lib/types';
import type {PaymentTarget} from '../lib/payment-group';
import {payableOwnOrders,summarizeOrderList} from '../lib/order-list';

export default function MyOrdersPayment({orders,userId,creditBalances,busy,onPay}:{orders:Order[];userId:string;creditBalances?:Record<string,number>;busy:boolean;onPay:(target:PaymentTarget)=>void}){
 const {t,money}=useI18n(),own=orders.filter(order=>order.actor===userId),totals=summarizeOrderList(own,creditBalances),payable=payableOwnOrders(own,userId);
 return <div className="my-orders-payment">
  <div className="my-orders-totals"><span>{t('Tổng đơn của tôi: ')}<strong>{money(totals.total)}</strong></span><span>{t('Đã thanh toán: ')}<strong>{money(totals.paid)}</strong></span>{totals.creditOffset>0?<span>{t('Số dư dự kiến trừ: ')}<strong>{money(totals.creditOffset)}</strong></span>:null}<span className="my-orders-due">{t('Cần thanh toán: ')}<strong>{money(totals.unpaid)}</strong></span>{totals.refundDue>0?<span>{t('Cần hoàn: ')}<strong>{money(totals.refundDue)}</strong></span>:null}</div>
  {payable.length?<div className="my-orders-pay-action"><small>{t('Thanh toán các đơn của bạn đang hiển thị trong ngày đã chọn.')}</small><button className="primary" disabled={busy} onClick={()=>onPay({name:payable[0].name,orders:payable.map(order=>({dayId:order.dayId,orderId:order.id}))})}>{totals.unpaid>0?t('Thanh toán'):t('Dùng số dư')}<ArrowUpRight size={16}/></button></div>:null}
 </div>;
}
