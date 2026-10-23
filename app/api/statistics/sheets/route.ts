import {parseSheetsStatistics} from '../../../../lib/sheets-statistics';
import {StatisticsAccessError,verifyStatisticsViewer} from '../../../../lib/statistics-access';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Authorization'};
// The source reference stays on the server. No personal sheet rows are bundled
// into the website, repository or unauthenticated responses.
export async function GET(request:Request){
 try{
  const token=request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1]||'';
  const development=process.env.NODE_ENV!=='production';
  await verifyStatisticsViewer(token,{projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID||'',apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY||'',authHost:development?process.env.FIREBASE_AUTH_EMULATOR_HOST:undefined});
  const id=process.env.MEAL_SPREADSHEET_ID||'';
  if(!id)return Response.json({error:'Chưa cấu hình nguồn Google Sheets. Chọn nguồn dữ liệu Web hoặc liên hệ quản trị viên.'},{status:503,headers});
  if(!/^[A-Za-z0-9_-]{20,100}$/.test(id))throw new Error('Nguồn Sheets chưa hợp lệ.');
  const response=await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx&cachebust=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(40000)});
  if(!response.ok)throw new Error('Chưa đọc được Google Sheets. Vui lòng thử lại.');
  if(Number(response.headers.get('content-length')||0)>50000000)throw new Error('Workbook quá lớn để đọc thống kê.');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length>50000000||bytes[0]!==80||bytes[1]!==75)throw new Error('Google Sheets chưa trả về workbook hợp lệ. Kiểm tra quyền xem file.');
  const data=parseSheetsStatistics(bytes,Number(process.env.MEAL_SHEETS_START_YEAR||2025));
  return Response.json({...data,sourceUrl:`https://docs.google.com/spreadsheets/d/${id}/edit`},{headers});
 }catch(error){
  const status=error instanceof StatisticsAccessError?error.status:502;
  return Response.json({error:error instanceof StatisticsAccessError?error.message:'Chưa tải được thống kê Google Sheets. Vui lòng cập nhật lại sau.'},{status,headers});
 }
}
