import test from 'node:test';
import assert from 'node:assert/strict';
import {choosePickup,pickupCandidates,pickupWeek,pickupDateOffset,secureRandomIndex,type PickupDraw} from '../lib/pickup';

test('pickup weeks start on Monday, including year boundaries',()=>{
 assert.equal(pickupWeek('2026-10-23').start,'2026-10-19');assert.equal(pickupWeek('2026-10-25').start,'2026-10-19');assert.equal(pickupWeek('2026-10-26').start,'2026-10-26');assert.equal(pickupWeek('2026-01-01').start,'2025-12-29');assert.equal(pickupWeek('2026-10-23').dates.length,7);assert.throws(()=>pickupWeek('2026-02-30'));
});
test('one person occupies one slot regardless of portions, duplicate casing or cancelled orders',()=>{
 const candidates=pickupCandidates([{name:' Khách A '},{name:'khách a'},{name:'Khách B',cancelled:true},{name:'Khách C'}],[]);assert.equal(candidates.length,2);assert.equal(candidates.find(p=>p.key==='khách a')?.weeklyCount,0);
});
test('lowest weekly counts are selected first, with random ties and no repeated person',()=>{
 const people=[{key:'a',name:'A',weeklyCount:3,lastDate:''},{key:'b',name:'B',weeklyCount:0,lastDate:''},{key:'c',name:'C',weeklyCount:0,lastDate:''},{key:'d',name:'D',weeklyCount:1,lastDate:''}];
 assert.deepEqual(choosePickup(people,2,n=>n-1).map(p=>p.key),['c','b']);assert.deepEqual(choosePickup(people,3,()=>0).map(p=>p.key),['b','c','d']);assert.throws(()=>choosePickup(people,5));assert.throws(()=>choosePickup(people,1.5));assert.throws(()=>choosePickup(people,0));assert.throws(()=>choosePickup(people,2,()=>-1));assert.equal(choosePickup(people,4).length,4);
});
test('balanced daily picks keep a stable attendance group within one turn across the week',()=>{
 const orders=Array.from({length:8},(_,i)=>({name:'Người '+i})),history:PickupDraw[]=[];
 for(let i=0;i<7;i++){const date=pickupDateOffset('2026-10-19',i),candidates=pickupCandidates(orders,history),selected=choosePickup(candidates,2,()=>0);history.push({date,weekStart:'2026-10-19',dayId:'sample',count:2,candidateCount:8,selected,selectedKeys:selected.map(p=>p.key),createdBy:'sample',createdAt:date,version:1});const counts=pickupCandidates(orders,history).map(p=>p.weeklyCount);assert.ok(Math.max(...counts)-Math.min(...counts)<=1);}
 assert.equal(history.flatMap(d=>d.selected).length,14);
 const returning=pickupCandidates([{name:'Người 0'},{name:'Người mới'}],history);assert.equal(choosePickup(returning,1)[0].name,'Người mới');
 assert.ok(pickupCandidates(orders,[]).every(p=>p.weeklyCount===0));
});
test('random index respects bounds and a ten-person draw can be configured',()=>{
 for(const n of [1,2,7,20,500])for(let i=0;i<20;i++){const x=secureRandomIndex(n);assert.ok(x>=0&&x<n);}
 const many=pickupCandidates(Array.from({length:25},(_,i)=>({name:'Người '+i})),[]);assert.equal(new Set(choosePickup(many,10).map(p=>p.key)).size,10);assert.throws(()=>choosePickup(many,11));
});
