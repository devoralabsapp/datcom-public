import type {Order} from './types';
import {validDate} from './meal-client-model';
export type RestaurantRow={dish:string;quantity:number;unitPrice:number;note:string};
export type RestaurantSummary={version:1;date:string;generatedAt:string;rows:RestaurantRow[]};
export function restaurantSummary(date:string,orders:Order[],now=new Date()):RestaurantSummary{
 const rows=new Map<string,RestaurantRow>();
 for(const order of orders.filter(o=>!o.cancelled)){
  const key=JSON.stringify([order.dish,order.price,order.note.trim()]),row=rows.get(key)||{dish:order.dish,quantity:0,unitPrice:order.price,note:order.note.trim()};row.quantity+=order.quantity;rows.set(key,row);
 }
 const result={version:1 as const,date,generatedAt:now.toISOString(),rows:[...rows.values()].sort((a,b)=>a.dish.localeCompare(b.dish,'vi')||a.unitPrice-b.unitPrice||a.note.localeCompare(b.note,'vi'))};
 return parseRestaurantSummary(result);
}
export function parseRestaurantSummary(value:unknown):RestaurantSummary{
 const v=value as RestaurantSummary;
 if(!v||v.version!==1||!validDate(v.date)||typeof v.generatedAt!=='string'||!Number.isFinite(Date.parse(v.generatedAt))||!Array.isArray(v.rows)||!v.rows.length||v.rows.length>500)throw new Error('Danh sách gửi nhà hàng chưa hợp lệ hoặc chưa có món.');
 const rows=v.rows.map(row=>{
  if(!row||typeof row.dish!=='string'||!row.dish.trim()||row.dish.length>160||typeof row.note!=='string'||row.note.length>300||!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>15000||!Number.isInteger(row.unitPrice)||row.unitPrice<1000||row.unitPrice>1000000)throw new Error('Danh sách gửi nhà hàng chưa hợp lệ hoặc chưa có món.');
  // Project fields: names, emails, user IDs and payment flags never enter a share/export.
  return {dish:row.dish,quantity:row.quantity,unitPrice:row.unitPrice,note:row.note};
 });
 return {version:1,date:v.date,generatedAt:v.generatedAt,rows};
}
export const restaurantTotals=(summary:RestaurantSummary)=>({quantity:summary.rows.reduce((sum,row)=>sum+row.quantity,0),amount:summary.rows.reduce((sum,row)=>sum+row.quantity*row.unitPrice,0)});
