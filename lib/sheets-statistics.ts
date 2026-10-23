import {strFromU8,unzipSync} from 'fflate';
import {XMLParser} from 'fast-xml-parser';
import {mealSession,type SheetsStatistics,type StatisticsOrder,type StatisticsWarning} from './statistics';
import {validDate} from './meal-client-model';

type Node=Record<string,unknown>;
const node=(v:unknown):Node=>v&&typeof v==='object'?v as Node:{};
const list=(v:unknown):Node[]=>v===undefined?[]:(Array.isArray(v)?v:[v]).map(node);
const text=(v:unknown):string=>v===undefined?'':typeof v==='object'?text(node(v)['#text']):String(v);
const normalize=(v:string)=>v.normalize('NFC').trim().toLocaleLowerCase('vi-VN');
function money(v:string):number|null{
 const s=v.trim().toLowerCase().replace(/[\sđ₫]/g,'');
 const k=/^(\d+(?:[.,]\d+)?)k$/.exec(s);if(k)return Number(k[1].replace(',','.'))*1000;
 if(/^\d+(?:\.0+)?$/.test(s))return Number(s);
 if(/^\d{1,3}(?:[.,]\d{3})+$/.test(s))return Number(s.replace(/[.,]/g,''));
 return null;
}

export function parseSheetsStatistics(bytes:Uint8Array,startYear=2025,fetchedAt=new Date().toISOString()):SheetsStatistics{
 let totalBytes=0;
 const files=unzipSync(bytes,{filter:file=>{
  if(!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(file.name))return false;
  totalBytes+=file.originalSize;if(file.originalSize>20000000||totalBytes>100000000)throw new Error('Workbook quá lớn để đọc thống kê.');return true;
 }});
 const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false,trimValues:false,removeNSPrefix:true});
 const xml=(path:string)=>{if(!files[path])throw new Error('Workbook thiếu dữ liệu bắt buộc.');return node(parser.parse(strFromU8(files[path])));};
 const strings=files['xl/sharedStrings.xml']?list(node(xml('xl/sharedStrings.xml').sst).si).map(si=>text(si.t)||list(si.r).map(r=>text(r.t)).join('')):[];
 const relationships=new Map(list(node(xml('xl/_rels/workbook.xml.rels').Relationships).Relationship).map(r=>[text(r['@_Id']),text(r['@_Target'])]));
 const metadata=list(node(node(xml('xl/workbook.xml').workbook).sheets).sheet);
 const orders:StatisticsOrder[]=[],warnings:StatisticsWarning[]=[];
 let year=startYear,previousMonth=11,sheetCount=0;
 for(const [index,meta] of metadata.entries()){
  const name=text(meta['@_name']),digits=name.match(/\d+/)?.[0];
  if(!digits){warnings.push({date:'',sheet:name,message:'Chưa xác định được ngày của sheet này.'});continue;}
  const tail=Number(digits.slice(-2)),month=digits.length>=3&&tail>=10&&tail<=12?tail:Number(digits.slice(-1)),day=Number(digits.slice(0,month>=10?-2:-1));
  if(previousMonth===12&&month===1)year++;previousMonth=month;
  const date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  if(!validDate(date)){warnings.push({date:'',sheet:name,message:'Tên sheet không xác định được ngày hợp lệ.'});continue;}
  const target=relationships.get(text(meta['@_id']))||relationships.get(text(meta['@_r:id']));
  if(!target)throw new Error('Không tìm thấy nội dung sheet.');
  const path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
  const rows=list(node(node(xml(path).worksheet).sheetData).row);sheetCount++;
  let sheetUnpaid=0,control:number|null=null;
  for(const row of rows){
   const rn=Number(row['@_r']),cells=new Map<string,{value:string;type:string}>();
   for(const c of list(row.c)){
    const column=text(c['@_r']).replace(/\d/g,''),type=text(c['@_t']);
    const value=type==='s'?strings[Number(text(c.v))]??'':type==='inlineStr'?text(node(c.is).t)||list(node(c.is).r).map(r=>text(r.t)).join(''):text(c.v);
    cells.set(column,{value,type});
   }
   const value=(col:string)=>cells.get(col)?.value||'';
   if(normalize(value('F'))==='chưa trả')control=money(value('H'));
   if(rn<3||!value('C').trim()||/^John Doe$|điền tên/i.test(value('A')))continue;
   const dish=value('C').trim(),amount=money(value('D'));
   if(/^hok có|^không (?:gọi|có)/i.test(dish))continue;
   if(amount===null||!Number.isSafeInteger(amount)||amount<=0){warnings.push({date,sheet:name,row:rn,message:`${value('A').trim()||'Chưa ghi tên'}: món “${dish}” chưa có giá hợp lệ, chưa cộng vào số tiền.`});continue;}
   const paidValue=normalize(value('B'));
   if(!['','0','1','false','true'].includes(paidValue)){warnings.push({date,sheet:name,row:rn,message:`${value('A').trim()||'Chưa ghi tên'}: chưa xác định được trạng thái đã trả.`});continue;}
   const paid=paidValue==='1'||paidValue==='true';
   if(!value('A').trim())warnings.push({date,sheet:name,row:rn,message:'Đơn chưa ghi tên; số tiền được cộng vào nhóm “Chưa ghi tên”, chưa xác định được người đặt.'});
   if(!paid)sheetUnpaid+=amount;
   orders.push({id:`sheets:${index+1}:${rn}`,dayId:`sheet-${index+1}`,date,session:mealSession(name),name:value('A').trim().normalize('NFC')||'Chưa ghi tên',dish,amount,quantity:1,paid,source:'sheets'});
  }
  if(control!==null&&sheetUnpaid!==control)warnings.push({date,sheet:name,message:`Tiền chưa trả từ từng đơn (${sheetUnpaid.toLocaleString('vi-VN')}đ) khác ô tổng (${control.toLocaleString('vi-VN')}đ).`});
 }
 if(!sheetCount)throw new Error('Chưa tìm thấy sheet đặt cơm hợp lệ.');
 return {orders,warnings,sheetCount,fetchedAt};
}
