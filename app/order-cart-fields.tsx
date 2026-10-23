'use client';
import {Minus,Plus,Trash2} from 'lucide-react';
import {useI18n} from '../components/i18n-provider';
import type {MenuItem} from '../lib/types';
export type CartLine={dish:MenuItem;quantity:number};
export default function OrderCartFields({items,disabled,onChange}:{items:CartLine[];disabled:boolean;onChange:(items:CartLine[])=>void}){
 const {t,money}=useI18n();
 function quantity(index:number,n:number){if(Number.isInteger(n)&&n>=1&&n<=30)onChange(items.map((line,i)=>i===index?{...line,quantity:n}:line));}
 return <div className="order-cart-lines">{items.map((line,index)=><div className="cart-line" key={line.dish.name}><div className="cart-line-title"><strong>{line.dish.name}</strong><button type="button" className="icon-btn danger" disabled={disabled} aria-label={t('Bỏ món {0}',{'0':line.dish.name})} onClick={()=>onChange(items.filter((_,i)=>i!==index))}><Trash2 size={15}/></button></div><small>{money(line.dish.price)} {t('/ suất')}</small><div className="cart-line-bottom"><div className="quantity"><button type="button" disabled={disabled||line.quantity<=1} aria-label={t('Giảm số suất của {0}',{'0':line.dish.name})} onClick={()=>quantity(index,line.quantity-1)}><Minus size={13}/></button><input type="number" min={1} max={30} inputMode="numeric" aria-label={t('Số suất của {0}',{'0':line.dish.name})} value={line.quantity} disabled={disabled} onChange={e=>quantity(index,Number(e.target.value))}/><button type="button" disabled={disabled||line.quantity>=30} aria-label={t('Tăng số suất của {0}',{'0':line.dish.name})} onClick={()=>quantity(index,line.quantity+1)}><Plus size={13}/></button></div><b>{money(line.quantity*line.dish.price)}</b></div></div>)}<p className="cart-help">{t('Chọn thêm món trong thực đơn; mỗi món có số lượng riêng. Ghi chú bên dưới áp dụng cho các món trong giỏ.')}</p></div>;
}
