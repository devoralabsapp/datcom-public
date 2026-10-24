import {collection,doc,getDoc,getDocs,query,where,orderBy,limit,startAfter,Timestamp,type QueryConstraint,type QueryDocumentSnapshot,type DocumentData} from 'firebase/firestore';
import type {MealClient} from './meal-client';
import {ensureUser} from './firebase-client';

export type ActivityEntry={id:string;kind:string;actorId:string;source:string;summary:string;dayId:string;orderId:string;reference:string;details:string;time:string|null};
export type ActivityCursor=QueryDocumentSnapshot<DocumentData>;
export async function readActivityPage(client:MealClient,userId:string,admin:boolean,cursor?:ActivityCursor){
 const user=await ensureUser(client.auth);if(user.uid!==userId)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại.');
 const constraints:QueryConstraint[]=admin?[]:[where('actorId','==',userId)];
 constraints.push(orderBy('createdAt','desc'));if(cursor)constraints.push(startAfter(cursor));constraints.push(limit(50));
 const result=await getDocs(query(collection(client.db,'activityLogs'),...constraints));
 return {entries:result.docs.map(d=>{
  // Pending serverTimestamp writes otherwise read as null. Keep legacy rows with unknown times too.
  const v=d.data({serverTimestamps:'estimate'});
  return {...v,id:d.id,time:v.createdAt instanceof Timestamp?v.createdAt.toDate().toISOString():null} as ActivityEntry;
 }),cursor:result.docs.at(-1),more:result.size===50};
}
export async function readActivityNames(client:MealClient,userId:string,admin:boolean){
 if(admin){const profiles=await getDocs(collection(client.db,'userProfiles'));return Object.fromEntries(profiles.docs.map(d=>[d.id,String(d.data().preferredName||d.data().displayName||'')]));}
 const profile=await getDoc(doc(client.db,'userProfiles',userId)),value=profile.data();return {[userId]:String(value?.preferredName||value?.displayName||'')};
}
