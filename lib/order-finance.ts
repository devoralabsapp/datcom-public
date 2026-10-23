export type OrderMoney={price:number;quantity:number;paid:boolean;cancelled?:boolean;receivedAmount?:number;refundedAmount?:number;voidedAmount?:number;creditInAmount?:number;creditOutAmount?:number;surplusChoice?:'refund'|'carry'};
// Older orders only stored a paid checkbox. Preserve its value as an opening
// balance on the first edit; subsequent changes use explicit money fields.
export function orderFinance(order:OrderMoney){
 const receivedAmount=order.receivedAmount??(order.paid?order.price*order.quantity:0),refundedAmount=order.refundedAmount??0,voidedAmount=order.voidedAmount??0;
 const creditInAmount=order.creditInAmount??0,creditOutAmount=order.creditOutAmount??0,surplusChoice=order.surplusChoice??'refund';
 const held=receivedAmount+creditInAmount-creditOutAmount-refundedAmount-voidedAmount,total=order.cancelled?0:order.price*order.quantity,surplus=Math.max(0,held-total);
 return {receivedAmount,refundedAmount,voidedAmount,creditInAmount,creditOutAmount,surplusChoice,held,total,surplus,due:Math.max(0,total-held),refundDue:surplusChoice==='refund'?surplus:0,creditAvailable:surplusChoice==='carry'?surplus:0,applied:Math.min(total,held)};
}
export function moneyFields(order:OrderMoney){const {receivedAmount,refundedAmount,voidedAmount,creditInAmount,creditOutAmount,surplusChoice}=orderFinance(order);return {receivedAmount,refundedAmount,voidedAmount,creditInAmount,creditOutAmount,surplusChoice};}
export function financiallyPaid(order:OrderMoney){return !order.cancelled&&orderFinance(order).due===0;}
