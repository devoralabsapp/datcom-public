import {orderFinance} from './order-finance';
import type {Order} from './types';

export type OrderListFilter='all'|'mine'|'unpaid'|'paid'|'refund'|'credit'|'cancelled';
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d');

export function filterOrderList(orders:Order[],filter:OrderListFilter,userId:string,search=''){
 const term=normalize(search.trim());
 return orders.filter(order=>{
  const f=orderFinance(order);
  const matches=filter==='all'||(filter==='mine'?order.actor===userId:filter==='paid'?order.paid:filter==='refund'?f.refundDue>0:filter==='credit'?f.creditAvailable>0:filter==='cancelled'?order.cancelled:f.due>0);
  return matches&&normalize(order.name+' '+order.dish).includes(term);
 });
}

export function summarizeOrderList(orders:Order[],creditBalances:Record<string,number>={}){
 const credit=new Map(Object.entries(creditBalances));
 let total=0,paid=0,due=0,refundDue=0,creditOffset=0;
 for(const order of orders){
  const f=orderFinance(order),available=credit.get(order.actor)||0,offset=Math.min(available,f.due);
  total+=f.total;paid+=f.applied;due+=f.due;refundDue+=f.refundDue;creditOffset+=offset;
  credit.set(order.actor,available-offset);
 }
 return {total,paid,due,refundDue,creditOffset,unpaid:due-creditOffset};
}

export function payableOwnOrders(orders:Order[],userId:string){return orders.filter(order=>order.actor===userId&&orderFinance(order).due>0);}
