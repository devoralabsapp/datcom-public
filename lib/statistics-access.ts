export class StatisticsAccessError extends Error{constructor(message:string,public status:number){super(message);}}
type Settings={projectId:string;apiKey:string;authHost?:string};

export async function verifyStatisticsViewer(token:string,settings:Settings,request:typeof fetch=fetch){
 const {projectId,apiKey}=settings;
 if(!token||token.length>16000)throw new StatisticsAccessError('Chưa có phiên đặt cơm. Vui lòng tải lại trang.',401);
 if(!apiKey||!projectId)throw new StatisticsAccessError('Website chưa có cấu hình Firebase.',503);
 const local=settings.authHost&&projectId.startsWith('demo-')&&/^127\.0\.0\.1:\d+$/.test(settings.authHost);
 const authBase=local?`http://${settings.authHost}/identitytoolkit.googleapis.com`:'https://identitytoolkit.googleapis.com';
 // accounts:lookup verifies the complete Firebase token. Reading its claims
 // below is safe only after this request succeeds and the UID matches.
 const account=await request(`${authBase}/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!account.ok)throw new StatisticsAccessError('Phiên đặt cơm không hợp lệ hoặc đã hết hạn. Vui lòng tải lại trang.',401);
 const user=(await account.json()).users?.[0];
 let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));}catch{throw new StatisticsAccessError('Phiên đăng nhập không hợp lệ.',401);}
 if(!user?.localId||user.disabled||claims.sub!==user.localId||claims.aud!==projectId||claims.iss!==`https://securetoken.google.com/${projectId}`||typeof claims.exp!=='number'||claims.exp*1000<=Date.now())throw new StatisticsAccessError('Phiên đặt cơm không hợp lệ hoặc đã hết hạn.',401);
 return user.localId as string;
}
