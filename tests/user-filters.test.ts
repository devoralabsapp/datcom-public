import test from 'node:test';
import assert from 'node:assert/strict';
import {filterManagedUsers,type ManagedUser} from '../lib/user-model';
const person=(uid:string,patch:Partial<ManagedUser>={}):ManagedUser=>({uid,displayName:uid,preferredName:'',email:'',provider:'google.com',createdAt:'',lastSeenAt:'',admin:false,blocked:false,orderCount:0,lastOrderDate:'',aliases:[],...patch});
test('user filters combine company, department, role and accent-insensitive search without losing unassigned accounts',()=>{
 const users=[person('a',{displayName:'ĐOÀN Ánh',companyId:'c1',departmentId:'d1',admin:true}),person('b',{companyId:'c1',departmentId:'d2',provider:'anonymous',blocked:true,aliases:['Tên khách']}),person('c',{companyId:'c2',departmentId:'d3'}),person('d'),person('e',{companyId:'c1'})];
 const find=(patch:Partial<Parameters<typeof filterManagedUsers>[1]>={})=>filterManagedUsers(users,{status:'all',companyId:'',departmentId:'',search:'',...patch}).map(p=>p.uid);
 assert.deepEqual(find(),['a','b','c','d','e']);assert.deepEqual(find({companyId:'c1'}),['a','b','e']);assert.deepEqual(find({companyId:'c1',departmentId:'d1',status:'admin',search:'doan anh'}),['a']);
 assert.deepEqual(find({companyId:'c1',departmentId:'d2',status:'guest',search:'ten khach'}),['b']);assert.deepEqual(find({companyId:'c1',status:'blocked'}),['b']);
 assert.deepEqual(find({companyId:'!none'}),['d']);assert.deepEqual(find({companyId:'c1',departmentId:'!none'}),['e']);assert.deepEqual(find({departmentId:'!none'}),['d','e']);assert.deepEqual(find({companyId:'c2',departmentId:'d1'}),[]);
});
