import {GoogleAuthProvider,linkWithPopup,signInWithCredential,signOut,setPersistence,inMemoryPersistence,getAuth,connectAuthEmulator,type AuthError} from 'firebase/auth';
import {deleteApp,initializeApp} from 'firebase/app';
import {collection,doc,getDocs,query,where,setDoc,deleteDoc,writeBatch,serverTimestamp,Timestamp,type Firestore} from 'firebase/firestore';
import {ensureUser,firebaseClient} from './firebase-client';

const pendingKey='com-nha:transfer:v2';
export async function moveGuestOrders(db:Firestore,sourceUid:string,targetUid:string){
 const days=await getDocs(collection(db,'days'));
 for(let i=0;i<days.docs.length;i+=8){await Promise.all(days.docs.slice(i,i+8).map(async day=>{
  const orders=await getDocs(query(collection(db,'days',day.id,'orders'),where('ownerId','==',sourceUid)));
  for(let j=0;j<orders.docs.length;j+=20){const batch=writeBatch(db);for(const order of orders.docs.slice(j,j+20))batch.update(order.ref,{ownerId:targetUid,updatedAt:serverTimestamp()});await batch.commit();}
 }));}
 await deleteDoc(doc(db,'accountLinks',sourceUid));
}

let transferTask:Promise<void>|undefined;
export async function resumeGuestTransfer(){
 if(transferTask)return transferTask;
 const {auth,db}=firebaseClient(),user=await ensureUser(auth);
 if(user.isAnonymous)return;
 let source:string|null=null;try{source=localStorage.getItem(pendingKey);}catch{return;}if(!source)return;
 if(transferTask)return transferTask;
 transferTask=(async()=>{try{await moveGuestOrders(db,source!,user.uid);localStorage.removeItem(pendingKey);}catch{throw new Error('Một số đơn khách chưa chuyển xong. Vui lòng tải lại trang để thử lại hoặc liên hệ người gom cơm.');}})();
 try{await transferTask;}finally{transferTask=undefined;}
}

export async function googleSignIn(){
 const {auth,db}=firebaseClient(),guest=await ensureUser(auth),provider=new GoogleAuthProvider();
 if(!guest.isAnonymous)return;
 try{await linkWithPopup(guest,provider);return;}catch(error){
  if((error as AuthError).code!=='auth/credential-already-in-use')throw error;
  const credential=GoogleAuthProvider.credentialFromError(error as AuthError);if(!credential)throw error;
  // Keep the anonymous session until Google identifies the existing account.
  const secondary=initializeApp(auth.app.options,'account-link-'+crypto.randomUUID());
  try{
   const other=getAuth(secondary);if(auth.emulatorConfig){const c=auth.emulatorConfig;connectAuthEmulator(other,`${c.protocol}://${c.host}:${c.port}`,{disableWarnings:true});}await setPersistence(other,inMemoryPersistence);
   const target=await signInWithCredential(other,credential);
   await setDoc(doc(db,'accountLinks',guest.uid),{targetUid:target.user.uid,createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+5*60000)});
   localStorage.setItem(pendingKey,guest.uid);
   await signInWithCredential(auth,credential);
   await resumeGuestTransfer();
  }finally{await deleteApp(secondary);}
 }
}
export async function googleSignOut(){await signOut(firebaseClient().auth);}
