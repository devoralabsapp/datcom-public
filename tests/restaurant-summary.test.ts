import test from 'node:test';
import assert from 'node:assert/strict';
import {restaurantSummary,restaurantTotals,parseRestaurantSummary} from '../lib/restaurant-summary';
import type {Order} from '../lib/types';
test('restaurant exports preserve distinct notes and prices without publishing identities or payment status',()=>{
 const make=(quantity:number,price:number,note='',cancelled=false)=>({id:'private-order',dayId:'private-day',name:'PRIVATE PERSON',actor:'private-owner',dish:'Cơm gà',price,quantity,note,cancelled,paid:true,updatedAt:'2026-10-23T00:00:00Z'} as Order);
 const summary=restaurantSummary('2026-10-23',[make(2,40000),make(3,40000),make(1,40000,'Không hành'),make(2,45000),make(9,40000,'',true)]);
 assert.equal(summary.rows.length,3);assert.deepEqual(restaurantTotals(summary),{quantity:8,amount:330000});
 const raw=JSON.stringify(summary);for(const privateValue of ['PRIVATE PERSON','private-owner','paid','cancelled','private-order'])assert.equal(raw.includes(privateValue),false);
 const projected=parseRestaurantSummary({...summary,secret:'ignore',rows:summary.rows.map(r=>({...r,name:'ignore',paid:true}))});assert.equal(JSON.stringify(projected),raw);
 assert.throws(()=>parseRestaurantSummary({...summary,rows:[{...summary.rows[0],quantity:-1}]}));assert.throws(()=>restaurantSummary('2026-10-23',[]));
});
