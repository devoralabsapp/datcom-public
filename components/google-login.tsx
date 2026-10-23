'use client';
import {useState} from 'react';
import {googleSignIn,googleSignOut} from '../lib/client-auth';
import {friendlyFirebaseError} from '../lib/firebase-client';
export default function GoogleLogin({signedIn=false,displayName='',compact=false}:{signedIn?:boolean;displayName?:string;compact?:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function login(){
  setBusy(true);setError('');
  try{
   if(signedIn)await googleSignOut();else await googleSignIn();
   location.assign('/');
  }catch(e){const code=(e as {code?:string}).code;setError(code==='auth/unauthorized-domain'?'Tên miền chưa được bật cho Google. Bạn vẫn có thể đặt cơm với tư cách khách.':code==='auth/popup-closed-by-user'?'Đã đóng cửa sổ Google. Bạn vẫn có thể tiếp tục đặt cơm.':friendlyFirebaseError(e));}finally{setBusy(false);}
 }
 return <div className={'google-login '+(compact?'compact':'')}><button className={compact?'outline-btn':'primary'} onClick={login} disabled={busy} title={signedIn?displayName:'Không bắt buộc đăng nhập'}>{busy?'Đang xử lý…':signedIn?'Đăng xuất':'Đăng nhập Google'}</button>{error?<p role="alert">{error}</p>:null}</div>;
}
