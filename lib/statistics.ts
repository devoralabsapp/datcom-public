import {localNow} from './meal-client-model';

export type StatisticsPeriod='today'|'week'|'month'|'all';
export type StatisticsSource='all'|'sheets'|'web';
export type StatisticsOrder={id:string;orderId?:string;ownerId?:string;dayId:string;date:string;session:string;name:string;dish:string;amount:number;quantity:number;paid:boolean;receivedAmount?:number;refundedAmount?:number;voidedAmount?:number;refundDue?:number;appliedAmount?:number;cancelled?:boolean;source:'sheets'|'web'};
export type StatisticsWarning={date:string;sheet:string;row?:number;message:string};
export type SheetsStatistics={orders:StatisticsOrder[];warnings:StatisticsWarning[];sheetCount:number;fetchedAt:string;sourceUrl?:string};
export const statisticsPeriods:{id:StatisticsPeriod;label:string}[]=[{id:'today',label:'Hôm nay'},{id:'week',label:'Tuần này'},{id:'month',label:'Tháng này'},{id:'all',label:'Tất cả'}];
export const personKey=(name:string)=>name.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi-VN');
export const mealSession=(label:string)=>/^pre-order/i.test(label)?'preorder':/^nước/i.test(label)?'drink':'meal';
const plusDays=(date:string,n:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};

export function periodRange(period:StatisticsPeriod,now=new Date()){
 const today=localNow(now).date;
 if(period==='all')return {start:'',end:'',label:'Toàn bộ thời gian'};
 const weekday=new Date(today+'T12:00:00Z').getUTCDay();
 const start=period==='week'?plusDays(today,-((weekday+6)%7)):period==='month'?today.slice(0,7)+'-01':today;
 const format=(s:string)=>s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4);
 return {start,end:plusDays(today,1),label:start===today?format(today):format(start)+' – '+format(today)};
}
export function combineStatistics(sheets:StatisticsOrder[],web:StatisticsOrder[]){
 // Names are the app's per-day order key. Keep the web edit when both sources
 // describe the same person/date/meal session; preserve separate preorder/drink days.
 const key=(o:StatisticsOrder)=>[o.date,o.session,personKey(o.name)].join('|');
 const webKeys=new Set(web.map(key));const kept=sheets.filter(o=>!webKeys.has(key(o)));
 return {orders:[...kept,...web],replaced:sheets.length-kept.length};
}
export function summarizeStatistics(orders:StatisticsOrder[],period:StatisticsPeriod,now=new Date()){
 const range=periodRange(period,now);
 const selected=orders.filter(o=>(!range.start||o.date>=range.start)&&(!range.end||o.date<range.end));
 const applied=(o:StatisticsOrder)=>o.appliedAmount??(o.paid?o.amount:0),total=selected.reduce((s,o)=>s+o.amount,0),paid=selected.reduce((s,o)=>s+applied(o),0),refundDue=selected.reduce((s,o)=>s+(o.refundDue||0),0);
 const byMonth=period==='all'&&new Set(selected.map(o=>o.date)).size>40;
 const trend=new Map<string,{key:string;total:number;paid:number;unpaid:number}>();
 if(period!=='all')for(let d=range.start;d<range.end;d=plusDays(d,1))trend.set(d,{key:d,total:0,paid:0,unpaid:0});
 const people=new Map<string,{key:string;name:string;total:number;paid:number;unpaid:number;refundDue:number;orders:number}>();
 for(const o of selected){
  const key=byMonth?o.date.slice(0,7):o.date;
  const point=trend.get(key)||{key,total:0,paid:0,unpaid:0};point.total+=o.amount;point.paid+=applied(o);point.unpaid+=o.amount-applied(o);trend.set(key,point);
  const pk=personKey(o.name),p=people.get(pk)||{key:pk,name:o.name,total:0,paid:0,unpaid:0,refundDue:0,orders:0};p.total+=o.amount;p.paid+=applied(o);p.unpaid+=o.amount-applied(o);p.refundDue+=o.refundDue||0;if(!o.cancelled)p.orders++;people.set(pk,p);
 }
 return {range,total,paid,unpaid:total-paid,refundDue,orderCount:selected.filter(o=>!o.cancelled).length,peopleCount:people.size,selected,byMonth,trend:[...trend.values()].sort((a,b)=>a.key.localeCompare(b.key)).map(p=>({...p,label:byMonth?p.key.slice(5)+'/'+p.key.slice(0,4):p.key.slice(8)+'/'+p.key.slice(5,7)})),people:[...people.values()].sort((a,b)=>b.unpaid-a.unpaid||b.total-a.total||a.name.localeCompare(b.name,'vi'))};
}
