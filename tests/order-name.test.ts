import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberedOrderName,rememberOrderName} from '../lib/order-name';

test('successful order names survive reload using the existing browser key',()=>{
 const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
 assert.equal(rememberedOrderName(storage),'');rememberOrderName('  Nguyễn An  ',storage);assert.equal(rememberedOrderName(storage),'Nguyễn An');assert.equal(values.get('com-nha:name:v1'),'Nguyễn An');
 rememberOrderName('  ',storage);rememberOrderName('x'.repeat(101),storage);assert.equal(rememberedOrderName(storage),'Nguyễn An');
 values.set('com-nha:name:v1','x'.repeat(101));assert.equal(rememberedOrderName(storage),'');
});
test('restricted browser storage never prevents ordering',()=>{
 const storage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
 assert.equal(rememberedOrderName(storage),'');assert.doesNotThrow(()=>rememberOrderName('An',storage));
});
