'use client';
import {recordActivity} from '../lib/activity';
import {useState} from 'react';
import {Copy,Download,Link2,LoaderCircle,X} from 'lucide-react';
import {useI18n} from '../components/i18n-provider';
import type {Workspace} from '../lib/types';
import type {MealClient} from '../lib/meal-client';
import {restaurantSummary} from '../lib/restaurant-summary';
import {createRestaurantShare,restaurantShares,revokeRestaurantShare} from '../lib/restaurant-share-client';
import {friendlyFirebaseError} from '../lib/firebase-client';
export default function RestaurantActions({workspace:w,client}:{workspace:Workspace;client:MealClient}){
 const {t,locale,timestamp}=useI18n();const [busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[links,setLinks]=useState<{token:string;expiresAt:string;active:boolean}[]>([]);
 async function action(key:string,work:()=>Promise<void>){if(busy)return;setBusy(key);setError('');setMessage('');try{await work();}catch(e){setError(friendlyFirebaseError(e));}finally{setBusy('');}}
 const link=(token:string)=>location.origin+'/share/'+token;
 return <div className="restaurant-actions"><h3>{t('Gửi nhà hàng')}</h3><p>{t('Gồm món, số lượng, đơn giá và ghi chú; không kèm tên người đặt hoặc trạng thái thanh toán. Nhiều trang JPG sẽ tải trong một file ZIP.')}</p><div className="restaurant-action-buttons">
  {(['pdf','jpg'] as const).map(format=><button key={format} className="outline-btn" disabled={!!busy||!w.orders.length} onClick={()=>void action(format,async()=>{const {exportRestaurant}=await import('../lib/restaurant-export');await exportRestaurant(restaurantSummary(w.day.date,w.orders),locale,format);void recordActivity(client,{kind:format==='pdf'?'export.pdf':'export.jpg',summary:format==='pdf'?'Xuất PDF gửi nhà hàng':'Xuất JPG gửi nhà hàng',dayId:w.day.id,details:{count:w.orders.length}}).catch(()=>{});})}>{busy===format?<LoaderCircle size={16} className="spin"/>:<Download size={16}/>}{format==='pdf'?t('Xuất PDF'):t('Xuất JPG')}</button>)}
  {w.admin?<><button className="outline-btn" disabled={!!busy||!w.orders.length} onClick={()=>void action('share',async()=>{const value=await createRestaurantShare(client,w.day.id,restaurantSummary(w.day.date,w.orders));setLinks(previous=>[value,...previous]);setMessage('Đã tạo link. Sao chép để gửi nhà hàng.');})}>{busy==='share'?<LoaderCircle className="spin" size={16}/>:<Link2 size={16}/>}{t('Tạo link chia sẻ')}</button><button className="text-btn" disabled={!!busy} onClick={()=>void action('list',async()=>setLinks(await restaurantShares(client,w.day.id)))}>{t('Các link đã tạo')}</button></>:null}</div>
  {error?<div className="error-banner" role="alert">{t(error)}</div>:null}{message?<p role="status">{t(message)}</p>:null}
  {links.length?<div className="restaurant-share-links"><p>{t('Link là bản chụp tại lúc tạo, dùng được 7 ngày và không cần đăng nhập. Thay đổi đơn sau đó cần tạo link mới.')}</p>{links.map(row=><div className="restaurant-share-link" key={row.token}><a href={'/share/'+row.token} target="_blank" rel="noreferrer">{t('Xem bản gửi nhà hàng')}</a><small>{row.active?t('Hết hạn: ')+timestamp(row.expiresAt):t('Đã thu hồi')}</small><button className="icon-btn" disabled={!row.active||!!busy} aria-label={t('Sao chép link')} onClick={()=>void action('copy',async()=>{await navigator.clipboard.writeText(link(row.token));setMessage('Đã sao chép link gửi nhà hàng.');})}><Copy size={16}/></button>{row.active?<button className="text-btn" disabled={!!busy} onClick={()=>void action('revoke',async()=>{await revokeRestaurantShare(client,row.token);setLinks(previous=>previous.map(l=>l.token===row.token?{...l,active:false}:l));})}><X size={14}/>{t('Thu hồi')}</button>:null}</div>)}</div>:null}
 </div>;
}
