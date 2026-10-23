export type OrderMoney={price:number;quantity:number;paid:boolean;cancelled?:boolean;receivedAmount?:number;refundedAmount?:number;voidedAmount?:number};
// Older orders only stored a paid checkbox. Preserve its value as an opening
// balance on the first edit; subsequent changes use explicit money fields.
export function orderFinance(order:OrderMoney){
 const receivedAmount=order.receivedAmount??(order.paid?order.price*order.quantity:0),refundedAmount=order.refundedAmount??0,voidedAmount=order.voidedAmount??0;
 const held=receivedAmount-refundedAmount-voidedAmount,total=order.cancelled?0:order.price*order.quantity;
 return {receivedAmount,refundedAmount,voidedAmount,held,total,due:Math.max(0,total-held),refundDue:Math.max(0,held-total),applied:Math.min(total,held)};
}
export function moneyFields(order:OrderMoney){const {receivedAmount,refundedAmount,voidedAmount}=orderFinance(order);return {receivedAmount,refundedAmount,voidedAmount};}
export function financiallyPaid(order:OrderMoney){return !order.cancelled&&orderFinance(order).due===0;}
