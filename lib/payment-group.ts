import type {BankAccount} from './payment-model';
import {validOrderId} from './meal-client-model';
export type PaymentOrderRef={dayId:string;orderId:string};
export type PaymentTarget={name:string;orders:PaymentOrderRef[]};
export type GroupItem=PaymentOrderRef&{key:string;date:string;name:string;dish:string;ownerId:string;dishId:string;price:number;quantity:number;amount:number};
export type PaymentGroup=BankAccount&{reference:string;name:string;amount:number;count:number;expiresAt:string;items:GroupItem[]};
export const MAX_GROUP_ORDERS=1000;
export function paymentItemKey(order:PaymentOrderRef){
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(order.dayId)||!validOrderId(order.orderId))throw new Error('Đơn thanh toán chưa hợp lệ.');
 return order.dayId+'~'+order.orderId;
}
export function paymentSelection(orders:PaymentOrderRef[]){
 const sorted=[...orders].sort((a,b)=>paymentItemKey(a).localeCompare(paymentItemKey(b)));
 if(!sorted.length||sorted.length>MAX_GROUP_ORDERS||new Set(sorted.map(paymentItemKey)).size!==sorted.length)throw new Error('Chọn từ 1 đến 1.000 dòng món khác nhau để thanh toán.');
 return sorted;
}
