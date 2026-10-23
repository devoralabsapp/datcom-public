'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Bar,BarChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {AlertCircle,CheckCheck,ChartNoAxesCombined,LoaderCircle,Receipt,RefreshCw,Search,Users,Wallet} from 'lucide-react';
import type {MealClient} from '../lib/meal-client';
import {ensureUser,friendlyFirebaseError} from '../lib/firebase-client';
import {combineStatistics,statisticsPeriods,summarizeStatistics,type SheetsStatistics,type StatisticsOrder,type StatisticsPeriod,type StatisticsSource} from '../lib/statistics';

const money=(n:number)=>new Intl.NumberFormat('vi-VN').format(n)+'đ';
const compact=(n:number)=>n>=1000000?new Intl.NumberFormat('vi-VN',{maximumFractionDigits:1}).format(n/1000000)+'tr':n>=1000?new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(n/1000)+'k':String(n);
const timestamp=(s:string)=>new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(s));
type Snapshot={web:StatisticsOrder[];sheets:SheetsStatistics|null;webError:string;sheetError:string;checkedAt:string};

export default function StatisticsPanel({client,userId,refreshKey=0}:{client:MealClient;userId:string;refreshKey?:number}){
 const [period,setPeriod]=useState<StatisticsPeriod>('today'),[source,setSource]=useState<StatisticsSource>('web'),[snapshot,setSnapshot]=useState<Snapshot|null>(null),[busy,setBusy]=useState(true),[search,setSearch]=useState('');
 const request=useRef(0),controller=useRef<AbortController|null>(null);
 const load=useCallback(async()=>{
  const sequence=++request.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;setBusy(true);
  try{
   const user=await ensureUser(client.auth);if(user.uid!==userId)return;
   const sheets=async()=>{
    if(source==='web')return null;
    const token=await user.getIdToken();
    const response=await fetch('/api/statistics/sheets',{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:abort.signal});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Chưa đọc được Google Sheets.');
    return data as SheetsStatistics;
   };
   const [webResult,sheetsResult]=await Promise.allSettled([source==='sheets'?Promise.resolve([]):client.statistics(),sheets()]);
   if(sequence!==request.current)return;
   setSnapshot({web:webResult.status==='fulfilled'?webResult.value:[],sheets:sheetsResult.status==='fulfilled'?sheetsResult.value:null,webError:webResult.status==='rejected'?friendlyFirebaseError(webResult.reason):'',sheetError:sheetsResult.status==='rejected'?friendlyFirebaseError(sheetsResult.reason):'',checkedAt:new Date().toISOString()});
  }catch(e){if(sequence===request.current)setSnapshot({web:[],sheets:null,webError:friendlyFirebaseError(e),sheetError:source!=='web'?friendlyFirebaseError(e):'',checkedAt:new Date().toISOString()});}
  finally{if(sequence===request.current)setBusy(false);}
 },[client,userId,source]);
 useEffect(()=>{void load();return()=>{request.current++;controller.current?.abort();};},[load,refreshKey]);
 const combined=useMemo(()=>combineStatistics(snapshot?.sheets?.orders||[],snapshot?.web||[]),[snapshot]);
 const orders=source==='sheets'?snapshot?.sheets?.orders||[]:source==='web'?snapshot?.web||[]:combined.orders;
 const result=useMemo(()=>summarizeStatistics(orders,period),[orders,period]);
 const sourceError=snapshot?[(source!=='sheets'?snapshot.webError:''),(source!=='web'?snapshot.sheetError:'')].filter(Boolean).join(' '):'';
 const ready=!!snapshot&&!sourceError&&!busy;
 const warnings=source==='web'?[]:(snapshot?.sheets?.warnings||[]).filter(w=>!w.date||((!result.range.start||w.date>=result.range.start)&&(!result.range.end||w.date<result.range.end)));
 const debtors=result.people.filter(p=>p.unpaid>0);
 const people=result.people.filter(p=>p.name.toLocaleLowerCase('vi-VN').includes(search.trim().toLocaleLowerCase('vi-VN')));
 const tooltip=(value:unknown)=>money(Number(value));
 const metric=(n:number)=>ready?money(n):'—';

 return <section className="statistics-panel" aria-label="Thống kê tiền cơm cả nhóm" aria-busy={busy}>
  <div className="statistics-controls">
   <div className="period-tabs" role="tablist" aria-label="Khoảng thời gian thống kê">{statisticsPeriods.map(p=><button key={p.id} id={'period-'+p.id} type="button" role="tab" aria-selected={period===p.id} aria-controls="statistics-results" onClick={()=>setPeriod(p.id)}>{p.label}</button>)}</div>
   <div className="statistics-source-controls"><label className="statistics-source-label" htmlFor="statistics-source">Nguồn dữ liệu<select id="statistics-source" value={source} onChange={e=>{setBusy(true);setSource(e.target.value as StatisticsSource);}}><option value="web">Đơn trên web</option><option value="sheets">Google Sheets (dữ liệu cũ)</option><option value="all">Sheets và đơn trên web</option></select></label><button className="outline-btn" onClick={()=>void load()} disabled={busy}><RefreshCw size={17} className={busy?'spin':''}/>Cập nhật</button></div>
  </div>
  <div className="statistics-context"><strong>{result.range.label}</strong><span>{snapshot&&!busy?'Cập nhật '+timestamp(snapshot.checkedAt):'Đang đọc dữ liệu…'} · Giờ Việt Nam</span></div>
  {busy?<div className="statistics-loading" role="status"><LoaderCircle className="spin" size={20}/><span>Đang lấy dữ liệu thanh toán từ {source==='web'?'đơn trên web':source==='sheets'?'Google Sheets':'Sheets và web'}…</span></div>:null}
  {sourceError&&!busy?<div className="error-banner" role="alert"><AlertCircle size={20}/><span>{sourceError} Chưa thể hiển thị đầy đủ số liệu cho nguồn đã chọn.</span></div>:null}
  {ready&&warnings.length?<div className="statistics-integrity-note" role="note"><AlertCircle size={18}/><span>{warnings.length} mục dữ liệu cần đối chiếu. Những dòng thiếu giá hoặc trạng thái chưa rõ chưa được cộng vào tổng. Xem chi tiết bên dưới.</span></div>:null}
  <div id="statistics-results" role="tabpanel" aria-labelledby={'period-'+period}>
   <div className="statistics-metrics">
    <article className="statistics-metric"><span className="stat-icon green"><Receipt size={22}/></span><span>Tổng tiền</span><strong>{metric(result.total)}</strong><small>{ready?result.orderCount+' đơn đặt cơm':'Đang đối chiếu dữ liệu'}</small></article>
    <article className="statistics-metric"><span className="stat-icon teal"><CheckCheck size={22}/></span><span>Đã trả</span><strong>{metric(result.paid)}</strong><small>{ready?(result.total?Math.round(result.paid/result.total*100):0)+'% tổng tiền':'—'}</small></article>
    <article className="statistics-metric outstanding"><span className="stat-icon amber"><Wallet size={22}/></span><span>Chưa trả</span><strong>{metric(result.unpaid)}</strong><small>{ready?debtors.length+' người còn nợ':'—'}</small></article>
    <article className="statistics-metric"><span className="stat-icon orange"><Users size={22}/></span><span>Người đặt cơm</span><strong>{ready?result.peopleCount:'—'}</strong><small>Trong khoảng thời gian đã chọn</small></article>
   </div>
   {ready?<>
    {!result.orderCount?<div className="statistics-empty"><ChartNoAxesCombined size={36}/><h2>Chưa có đơn trong khoảng thời gian này</h2><p>Chọn khoảng thời gian khác hoặc cập nhật lại sau.</p></div>:<>
     <div className="statistics-chart-grid">
      <article className="statistics-chart-card"><div className="statistics-chart-heading"><div><h2>Thanh toán theo {result.byMonth?'tháng':'ngày'}</h2><p>Tổng tiền = Đã trả + Chưa trả</p></div></div><div className="statistics-legend"><span><i className="paid-color"/>Đã trả</span><span><i className="unpaid-color"/>Chưa trả</span></div><div className="statistics-trend-chart">
       <ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={result.trend} accessibilityLayer margin={{top:12,right:12,left:0,bottom:8}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5ebe6"/><XAxis dataKey="label" tick={{fontSize:12,fill:'#60736a'}} axisLine={false} tickLine={false} minTickGap={18}/><YAxis tickFormatter={compact} tick={{fontSize:12,fill:'#60736a'}} axisLine={false} tickLine={false} width={58}/><Tooltip formatter={tooltip} contentStyle={{borderRadius:10,borderColor:'#dfe7e1',fontSize:14}}/><Bar dataKey="paid" name="Đã trả" stackId="payment" fill="#31775d" maxBarSize={42}/><Bar dataKey="unpaid" name="Chưa trả" stackId="payment" fill="#c28a36" radius={[4,4,0,0]} maxBarSize={42}/></BarChart></ResponsiveContainer>
      </div><details className="statistics-data-details"><summary>Xem số liệu theo {result.byMonth?'tháng':'ngày'}</summary><div className="table-scroll"><table><thead><tr><th>Thời gian</th><th>Tổng tiền</th><th>Đã trả</th><th>Chưa trả</th></tr></thead><tbody>{result.trend.map(p=><tr key={p.key}><td>{p.label}</td><td>{money(p.total)}</td><td>{money(p.paid)}</td><td>{money(p.unpaid)}</td></tr>)}</tbody></table></div></details></article>
      <article className="statistics-chart-card"><div className="statistics-chart-heading"><div><h2>Tiền chưa trả theo người</h2><p>{debtors.length} người · {money(result.unpaid)}</p></div></div>{debtors.length?<div className="statistics-debt-scroll"><div style={{height:Math.max(230,debtors.length*42)}}><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={debtors} layout="vertical" accessibilityLayer margin={{top:10,right:28,left:0,bottom:10}}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5ebe6"/><XAxis type="number" tickFormatter={compact} tick={{fontSize:12,fill:'#60736a'}} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="name" width={116} tickFormatter={name=>String(name).length>17?String(name).slice(0,16)+'…':String(name)} tick={{fontSize:12,fill:'#334d3e'}} axisLine={false} tickLine={false}/><Tooltip formatter={tooltip} contentStyle={{borderRadius:10,borderColor:'#dfe7e1',fontSize:14}}/><Bar dataKey="unpaid" name="Chưa trả" fill="#c28a36" radius={[0,4,4,0]} maxBarSize={24}/></BarChart></ResponsiveContainer></div></div>:<div className="statistics-paid-empty"><CheckCheck size={32}/><h3>Đã thanh toán đầy đủ</h3><p>Không còn khoản chưa trả trong khoảng thời gian này.</p></div>}</article>
     </div>
     <section className="table-section statistics-people"><div className="section-heading"><div><h2>Chi tiết theo người <span>{result.peopleCount} người</span></h2><p>Sắp xếp theo số tiền chưa trả giảm dần</p></div><div className="searchbox"><Search size={18}/><input aria-label="Tìm người trong thống kê" placeholder="Tìm người đặt cơm…" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="table-scroll"><table><thead><tr><th scope="col">Người đặt</th><th scope="col">Tổng tiền</th><th scope="col">Đã trả</th><th scope="col">Chưa trả</th><th scope="col">Số đơn</th></tr></thead><tbody>{people.map(p=><tr key={p.key}><td><strong>{p.name}</strong></td><td data-label="Tổng tiền">{money(p.total)}</td><td data-label="Đã trả" className="statistics-paid">{money(p.paid)}</td><td data-label="Chưa trả" className={p.unpaid?'statistics-unpaid':'statistics-zero'}>{money(p.unpaid)}</td><td data-label="Số đơn">{p.orders}</td></tr>)}</tbody></table></div>{!people.length?<div className="empty-state">Không tìm thấy người phù hợp.</div>:null}<div className="table-footer"><span>{result.orderCount} đơn trong khoảng đã chọn</span><strong>Tổng chưa trả: {money(result.unpaid)}</strong></div></section>
    </>}
    {warnings.length?<details className="statistics-warnings"><summary><AlertCircle size={18}/>{warnings.length} mục dữ liệu cần kiểm tra</summary><p>Các dòng thiếu giá hoặc trạng thái chưa xác định chưa được cộng vào số tiền.</p><ul>{warnings.map((warning,i)=><li key={i}>Sheet {warning.sheet}{warning.row?', dòng '+warning.row:''}: {warning.message}</li>)}</ul>{snapshot.sheets?.sourceUrl?<a className="text-btn" href={snapshot.sheets.sourceUrl} target="_blank" rel="noreferrer">Mở Google Sheets để đối chiếu</a>:null}</details>:null}
    <div className="statistics-footnote">{source==='all'?<>Kết hợp {snapshot.sheets?.sheetCount||0} sheet và đơn trên web. Đơn trên web trùng ngày, tên và bữa ăn được ưu tiên{combined.replaced?' ('+combined.replaced+' dòng Sheets được thay thế)':''}.</>:source==='sheets'?<>Đang đọc {snapshot.sheets?.sheetCount||0} sheet, bao gồm các sheet ẩn.</>:<>Số liệu từ đơn đã lưu trên web; đơn đã hủy được loại khỏi thống kê.</>} Tuần bắt đầu từ thứ Hai. Tiền được tính theo ngày đặt cơm.</div>
   </>:null}
  </div>
 </section>;
}
