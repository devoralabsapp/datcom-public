import test from 'node:test';
import assert from 'node:assert/strict';
import {strToU8,zipSync} from 'fflate';
import {combineStatistics,periodRange,summarizeStatistics,type StatisticsOrder} from '../lib/statistics';
import {parseSheetsStatistics} from '../lib/sheets-statistics';
import {StatisticsAccessError,verifyStatisticsViewer} from '../lib/statistics-access';

const order=(date:string,amount:number,paid=false,source:'sheets'|'web'='sheets',name='Người mẫu',session='meal'):StatisticsOrder=>({id:[date,name,source,session].join(':'),dayId:'sample',date,name,amount,paid,source,session,dish:'Cơm mẫu',quantity:1});
test('Vietnam time, Monday weeks and month boundaries filter dates correctly',()=>{
 const monday=new Date('2026-01-04T17:10:00Z');
 assert.deepEqual(periodRange('week',monday),{start:'2026-01-05',end:'2026-01-06',label:'05/01/2026'});
 assert.equal(periodRange('month',new Date('2026-02-28T17:01:00Z')).start,'2026-03-01');
 const now=new Date('2026-10-22T09:00:00Z');
 const records=[order('2026-10-22',80000),order('2026-10-21',40000,true),order('2026-10-18',50000),order('2026-09-30',60000),order('2026-10-23',70000)];
 assert.equal(summarizeStatistics(records,'today',now).total,80000);
 const week=summarizeStatistics(records,'week',now);assert.equal(week.total,120000);assert.equal(week.paid,40000);assert.equal(week.unpaid,80000);assert.equal(week.trend.length,4);
 assert.equal(summarizeStatistics(records,'month',now).total,170000);
 assert.equal(summarizeStatistics(records,'all',now).total,300000);
 assert.equal(summarizeStatistics([],'all',now).total,0);
});
test('combined data prefers the web order while preserving other meal sessions',()=>{
 const source=[order('2026-10-22',40000,false,'sheets',' Khách A '),order('2026-10-22',50000,false,'sheets','Khách A','preorder'),order('2026-10-21',40000,false,'sheets','Khách A')];
 const web=[order('2026-10-22',80000,true,'web','khách a')];
 const mixed=combineStatistics(source,web);assert.equal(mixed.replaced,1);assert.equal(mixed.orders.length,3);
 const all=summarizeStatistics(mixed.orders,'all');assert.equal(all.total,170000);assert.equal(all.paid,80000);assert.equal(all.unpaid,90000);assert.equal(all.peopleCount,1);
});
test('XLSX reader uses checkbox and individual prices, includes hidden sheets and flags missing prices',()=>{
 const worksheet=(paid:string)=>`<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Tên</t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Người mẫu</t></is></c><c r="B3" t="b"><v>${paid}</v></c><c r="C3" t="inlineStr"><is><t>Cơm mẫu</t></is></c><c r="D3" t="inlineStr"><is><t>40k</t></is></c></row><row r="4"><c r="A4" t="inlineStr"><is><t>Chưa có giá</t></is></c><c r="B4" t="b"><v>1</v></c><c r="C4" t="inlineStr"><is><t>Nước ép</t></is></c><c r="D4" t="e"><v>#N/A</v></c></row><row r="30"><c r="F30" t="inlineStr"><is><t>Chưa trả</t></is></c><c r="G30"><v>0</v></c><c r="H30"><v>${paid==='1'?0:40000}</v></c></row></sheetData></worksheet>`;
 function workbook(paid:string){return zipSync({'xl/workbook.xml':strToU8('<workbook xmlns:r="test"><sheets><sheet name="2212" sheetId="1" r:id="rId1" state="hidden"/></sheets></workbook>'),'xl/_rels/workbook.xml.rels':strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),'xl/worksheets/sheet1.xml':strToU8(worksheet(paid))});}
 const before=parseSheetsStatistics(workbook('0'));assert.equal(before.sheetCount,1);assert.equal(before.orders[0].amount,40000);assert.equal(before.orders[0].paid,false);assert.equal(before.warnings.length,1);
 const after=parseSheetsStatistics(workbook('1'));assert.equal(summarizeStatistics(after.orders,'all').unpaid,0);assert.equal(summarizeStatistics(after.orders,'all').paid,40000);assert.equal(after.warnings.length,1);
 assert.throws(()=>parseSheetsStatistics(new Uint8Array([1,2,3])));
});
test('Sheets accepts valid anonymous and Google visitors, rejects invalid or foreign tokens',async()=>{
 const settings={projectId:'sample-project',apiKey:'public-test-key'};
 const token=(extra:Record<string,unknown>={})=>'header.'+Buffer.from(JSON.stringify({sub:'sample-viewer',aud:settings.projectId,iss:'https://securetoken.google.com/'+settings.projectId,exp:Math.floor(Date.now()/1000)+3600,firebase:{sign_in_provider:'anonymous'},...extra})).toString('base64url')+'.signature';
 const user={localId:'sample-viewer',emailVerified:false};let calls=0;
 const request=(async(url:RequestInfo|URL,init?:RequestInit)=>{calls++;assert.equal(init?.cache,'no-store');assert.ok(String(url).includes('accounts:lookup'));return Response.json({users:[user]});}) as typeof fetch;
 await assert.rejects(verifyStatisticsViewer('',settings,request),(e:unknown)=>e instanceof StatisticsAccessError&&e.status===401);assert.equal(calls,0);
 assert.equal(await verifyStatisticsViewer(token(),settings,request),'sample-viewer');assert.equal(calls,1);
 assert.equal(await verifyStatisticsViewer(token({firebase:{sign_in_provider:'google.com'}}),settings,request),'sample-viewer');assert.equal(calls,2);
 for(const extra of [{aud:'wrong-project'},{sub:'another-user'},{iss:'https://securetoken.google.com/other-project'},{exp:0}])await assert.rejects(verifyStatisticsViewer(token(extra),settings,request));
 const disabled=(async()=>Response.json({users:[{...user,disabled:true}]})) as typeof fetch;
 await assert.rejects(verifyStatisticsViewer(token(),settings,disabled),(e:unknown)=>e instanceof StatisticsAccessError&&e.status===401);
 let lookedUp=0;const invalid=(async()=>{lookedUp++;return Response.json({error:'INVALID_ID_TOKEN'},{status:400});}) as typeof fetch;
 await assert.rejects(verifyStatisticsViewer(token(),settings,invalid));assert.equal(lookedUp,1);
});
