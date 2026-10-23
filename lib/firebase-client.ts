import {getApp,getApps,initializeApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInAnonymously,type Auth} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator} from 'firebase/firestore';

let services:ReturnType<typeof initialize>|undefined;
function initialize(){
 const config={apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY,authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,storageBucket:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,messagingSenderId:process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID};
 if(!config.apiKey||!config.authDomain||!config.projectId)throw new Error('Website chưa có cấu hình Firebase. Vui lòng liên hệ người quản lý.');
 const app=getApps().length?getApp():initializeApp(config),auth=getAuth(app),db=getFirestore(app,process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID||'(default)');
 const authHost=process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,dbHost=process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST;
 if(authHost||dbHost){
  if(process.env.NODE_ENV==='production'||!config.projectId.startsWith('demo-')||!authHost||!dbHost||![authHost,dbHost].every(v=>/^127\.0\.0\.1:\d+$/.test(v)))throw new Error('Emulator chỉ được dùng với project demo tại máy.');
  connectAuthEmulator(auth,'http://'+authHost,{disableWarnings:true});const [host,port]=dbHost.split(':');connectFirestoreEmulator(db,host,Number(port));
 }
 return {auth,db};
}
export function firebaseClient(){return services??=initialize();}
const anonymousRequests=new WeakMap<Auth,Promise<unknown>>();
export async function ensureUser(auth:Auth){
 await auth.authStateReady();
 if(!auth.currentUser){
  let request=anonymousRequests.get(auth);if(!request){request=signInAnonymously(auth);anonymousRequests.set(auth,request);}
  try{await request;}finally{anonymousRequests.delete(auth);}
 }
 if(!auth.currentUser)throw new Error('Chưa khởi tạo được phiên đặt cơm. Vui lòng tải lại.');
 return auth.currentUser;
}
export function friendlyFirebaseError(error:unknown){
 const code=(error as {code?:string})?.code;
 if(code==='auth/operation-not-allowed'||code==='auth/admin-restricted-operation')return 'Chưa bật đăng nhập Ẩn danh hoặc Google trong Firebase. Vui lòng liên hệ người quản lý.';
 if(code==='permission-denied')return 'Chưa được cấp quyền, hoặc Firestore Rules chưa được cập nhật. Vui lòng liên hệ người quản lý.';
 if(code==='unavailable'||code==='auth/network-request-failed')return 'Chưa kết nối được Firebase. Kiểm tra mạng rồi thử lại.';
 return error instanceof Error?error.message:'Chưa tải được dữ liệu. Vui lòng thử lại.';
}
