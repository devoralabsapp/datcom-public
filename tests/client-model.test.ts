import test from 'node:test';
import assert from 'node:assert/strict';
import {publicWorkspace,nameId,isLocked,validDate,validateMenu,mealDays,selectMealDay} from '../lib/meal-client-model';
test('public bootstrap excludes personal data and duplicate names have stable IDs',async()=>{
 const day={id:'sample',date:'2099-01-01',label:'Sample',menu:[{name:'Cơm mẫu',price:40000}],source:true,status:'auto',orders:[{name:'PRIVATE_SAMPLE_PERSON',paid:true}],members:['PRIVATE_SAMPLE_PERSON']};
 const source={days:[day],importedAt:'2026-10-22',spreadsheetUrl:'https://private-sample.invalid'};
 const text=JSON.stringify(publicWorkspace(source));assert.ok(!text.includes('PRIVATE_SAMPLE_PERSON'));assert.ok(!text.includes('private-sample.invalid'));
 assert.equal(await nameId('Mẫu'),await nameId('mẫu'));assert.equal(isLocked({...day,date:'2000-01-01'}),true);assert.equal(validDate('2026-02-31'),false);
 assert.throws(()=>validateMenu([{name:'A',price:40000},{name:'a',price:40000}]));
});

test('today is the default even when only older or future menus exist',()=>{
 const now=new Date('2026-10-23T00:00:00+07:00'),past={id:'past',date:'2026-10-22',label:'22/10',menu:[{name:'Món cũ',price:40000}],source:true,status:'auto'};
 const source={days:[past,{...past,id:'future',date:'2026-10-24'}],importedAt:'sample'};
 const view=publicWorkspace(source,now);
 assert.equal(view.day.date,'2026-10-23');assert.equal(view.day.id,'day-2026-10-23');assert.deepEqual(view.day.menu,[]);assert.equal(view.storageReady,false);assert.equal(view.sourceCount,2);
 assert.equal(selectMealDay(view.days,'past',now).id,'past');
 const tomorrow=new Date('2026-10-24T00:00:00+07:00');assert.equal(selectMealDay(mealDays(view.days,tomorrow),undefined,tomorrow).id,'future');
});

test('published today is selected ahead of preorder and empty bootstrap',()=>{
 const now=new Date('2026-10-23T23:59:59+07:00'),base={date:'2026-10-23',menu:[{name:'Món hôm nay',price:40000}],source:false,status:'auto'};
 const days=mealDays([{...base,id:'pre',label:'pre-order 23/10'},{...base,id:'z-sheet',source:true,label:'Sheet cũ 23/10'},{...base,id:'day-2026-10-23',label:'23/10'}],now);
 assert.equal(days.length,3);assert.equal(selectMealDay(days,undefined,now).id,'day-2026-10-23');
 assert.equal(selectMealDay(days,'pre',now).id,'pre');
 assert.equal(publicWorkspace({days:[],importedAt:'sample'},now).day.date,'2026-10-23');
});
