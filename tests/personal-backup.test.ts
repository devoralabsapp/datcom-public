import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePersonalBackup,requiresMoneyReview,MAX_BACKUP_BYTES,type PersonalBackup} from '../lib/personal-backup';
const sample=():PersonalBackup=>({format:'lunch-together.personal-data',version:1,exportedAt:'2026-10-24T00:00:00.000Z',sourceUserId:'sample-person',profile:{preferredName:'Người mẫu',companyId:'',departmentId:'',phone:'',jobTitle:'',email:'',google:false},affiliation:{},orders:[{dayId:'day-2099-01-01',orderId:'a'.repeat(64),date:'2099-01-01',order:{ownerId:'sample-person',name:'Người mẫu',dish:'Cơm mẫu',price:40000,quantity:2,note:'Ít cơm',paid:false,cancelled:false},financialEvents:[]}],activity:[],creditTransfers:[],creditSources:[]});
test('personal backup format validates size, identity, money, duplicate lines and mixed-user sections',()=>{
 assert.equal(parsePersonalBackup(JSON.stringify(sample())).orders[0].order.quantity,2);
 for(const mutate of [(v:PersonalBackup)=>{v.version=2 as 1;},(v:PersonalBackup)=>{v.orders[0].order.ownerId='other';},(v:PersonalBackup)=>{v.orders[0].order.receivedAmount=-1;},(v:PersonalBackup)=>{v.orders[0].order.quantity=31;},(v:PersonalBackup)=>{v.orders.push(v.orders[0]);},(v:PersonalBackup)=>{v.activity.push({actorId:'other'});},(v:PersonalBackup)=>{v.creditTransfers.push({ownerId:'other'});},(v:PersonalBackup)=>{v.orders[0].dayId='../escape';}]){const value=sample();mutate(value);assert.throws(()=>parsePersonalBackup(JSON.stringify(value)));}
 assert.throws(()=>parsePersonalBackup('{broken'));assert.throws(()=>parsePersonalBackup('x'.repeat(MAX_BACKUP_BYTES+1)),/10 MB/);
});
test('every financial signal requires administrator review and untouched unpaid rows remain restorable',()=>{
 const row=sample().orders[0];assert.equal(requiresMoneyReview(row),false);
 for(const field of ['receivedAmount','refundedAmount','voidedAmount','creditInAmount','creditOutAmount'])assert.equal(requiresMoneyReview({...row,order:{...row.order,[field]:1}}),true);
 assert.equal(requiresMoneyReview({...row,order:{...row.order,paid:true}}),true);assert.equal(requiresMoneyReview({...row,financialEvents:[{kind:'refund'}]}),true);
});
