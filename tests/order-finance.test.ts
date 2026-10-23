import test from 'node:test';
import assert from 'node:assert/strict';
import {orderFinance,moneyFields} from '../lib/order-finance';
import {summarizeStatistics,type StatisticsOrder} from '../lib/statistics';
test('legacy paid amounts survive price changes, cancellation and actual refunds',()=>{
 const old={price:50000,quantity:1,paid:true},money=moneyFields(old);
 assert.equal(orderFinance({...old,...money,price:60000}).due,10000);
 assert.equal(orderFinance({...old,...money,price:40000}).refundDue,10000);
 assert.equal(orderFinance({...old,...money,cancelled:true,paid:false}).refundDue,50000);
 assert.equal(orderFinance({...old,...money,cancelled:true,paid:false,refundedAmount:50000}).refundDue,0);
});
test('statistics count partial payments and refunds separately without charging cancelled meals',()=>{
 const a:StatisticsOrder={id:'a',name:'Mẫu',dayId:'day',date:'2099-01-01',session:'meal',source:'web',dish:'Cơm',quantity:1,amount:60000,paid:false,appliedAmount:50000,refundDue:0};
 const b={...a,id:'b',amount:0,appliedAmount:0,cancelled:true,refundDue:40000};
 const r=summarizeStatistics([a,b],'all');assert.equal(r.total,60000);assert.equal(r.paid,50000);assert.equal(r.unpaid,10000);assert.equal(r.refundDue,40000);assert.equal(r.orderCount,1);assert.equal(r.people[0].refundDue,40000);
});
