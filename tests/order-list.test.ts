import test from 'node:test';
import assert from 'node:assert/strict';
import {filterOrderList,payableOwnOrders,summarizeOrderList} from '../lib/order-list';
import type {Order} from '../lib/types';
const base:Order={id:'one',dayId:'day-2099-01-01',actor:'me',name:'Người mẫu',dish:'Cơm gà',price:50000,quantity:1,paid:false,cancelled:false,note:'',updatedAt:''};
const orders:Order[]=[base,{...base,id:'two',dish:'Đậu nhồi thịt',quantity:2,price:40000},{...base,id:'three',dish:'Salad',price:50000},{...base,id:'four',actor:'other',quantity:2,paid:true},{...base,id:'five',actor:'other',price:50000,paid:true}];

test('order list totals follow each tab and search rather than the entire day',()=>{
 assert.equal(summarizeOrderList(filterOrderList(orders,'all','me')).total,330000);
 assert.equal(summarizeOrderList(filterOrderList(orders,'mine','me')).total,180000);
 assert.equal(summarizeOrderList(filterOrderList(orders,'unpaid','me')).total,180000);
 assert.equal(summarizeOrderList(filterOrderList(orders,'paid','me')).total,150000);
 const search=filterOrderList(orders,'mine','me','DAU');assert.deepEqual(search.map(o=>o.id),['two']);assert.equal(summarizeOrderList(search).total,80000);
 assert.equal(summarizeOrderList(filterOrderList(orders,'mine','me','không tồn tại')).total,0);
});

test('refund, credit and cancellation tabs total only displayed meals',()=>{
 const rows=[{...base,id:'refund',paid:true,price:40000,receivedAmount:50000},{...base,id:'carry',paid:true,receivedAmount:80000,surplusChoice:'carry' as const},{...base,id:'cancelled',cancelled:true,receivedAmount:50000}];
 assert.equal(summarizeOrderList(filterOrderList(rows,'refund','me')).total,40000);
 assert.equal(summarizeOrderList(filterOrderList(rows,'refund','me')).refundDue,60000);
 assert.equal(summarizeOrderList(filterOrderList(rows,'credit','me')).total,50000);
 assert.equal(summarizeOrderList(filterOrderList(rows,'cancelled','me')).total,0);
 assert.equal(summarizeOrderList(rows).total,90000);
});

test('my aggregate payment preserves partial payments and uses saved credit once',()=>{
 const rows=[{...base,receivedAmount:20000},{...base,id:'two',price:40000},{...base,id:'paid',paid:true},{...base,id:'cancelled',cancelled:true,receivedAmount:50000},{...base,id:'foreign',actor:'other'}];
 const mine=filterOrderList(rows,'mine','me'),totals=summarizeOrderList(mine,{me:40000,other:100000});
 assert.deepEqual(totals,{total:140000,paid:70000,due:70000,refundDue:50000,creditOffset:40000,unpaid:30000});
 assert.deepEqual(payableOwnOrders(mine,'me').map(o=>o.id),['one','two']);
 assert.equal(summarizeOrderList(mine,{me:100000}).unpaid,0);
 assert.equal(payableOwnOrders(mine,'me').length,2,'Credit-covered orders still need an allocation action');
});

test('ownership determines my orders even when names differ or another owner has the same name',()=>{
 const rows=[base,{...base,id:'alias',name:'Tên khác'},{...base,id:'same-name',actor:'other'}];
 assert.deepEqual(payableOwnOrders(filterOrderList(rows,'mine','me'),'me').map(o=>o.id),['one','alias']);
 assert.equal(payableOwnOrders(rows,'other').length,1);
});
