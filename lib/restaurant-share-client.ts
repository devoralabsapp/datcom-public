import {appendActivity} from './activity';
import {collection,doc,getDocs,query,where,setDoc,updateDoc,serverTimestamp,Timestamp,writeBatch} from 'firebase/firestore';
import type {MealClient} from './meal-client';
import {ensureUser} from './firebase-client';
import {parseRestaurantSummary,type RestaurantSummary} from './restaurant-summary';
export async function createRestaurantShare(client:MealClient,dayId:string,value:RestaurantSummary){
 if(!await client.isAdmin())throw new Error('Chỉ quản trị viên được tạo hoặc thu hồi link gửi nhà hàng.');
 const user=await ensureUser(client.auth),summary=parseRestaurantSummary(value),token=crypto.randomUUID().replace(/-/g,''),expiresAt=Timestamp.fromMillis(Date.now()+7*86400000);
 const batch=writeBatch(client.db);batch.set(doc(client.db,'restaurantShares',token),{dayId,payload:JSON.stringify(summary),active:true,version:1,createdBy:user.uid,createdAt:serverTimestamp(),expiresAt});appendActivity(batch,client.db,user.uid,{kind:'share.create',summary:'Tạo link gửi nhà hàng',dayId,details:{rowCount:summary.rows.length,rows:summary.rows.slice(0,20)}});await batch.commit();return {token,expiresAt:expiresAt.toDate().toISOString(),active:true};
}
export async function restaurantShares(client:MealClient,dayId:string){
 if(!await client.isAdmin())throw new Error('Chỉ quản trị viên được tạo hoặc thu hồi link gửi nhà hàng.');
 const list=await getDocs(query(collection(client.db,'restaurantShares'),where('dayId','==',dayId)));
 return list.docs.map(d=>({token:d.id,active:d.data().active===true,expiresAt:d.data().expiresAt.toDate().toISOString(),createdAt:d.data().createdAt.toMillis()})).sort((a,b)=>b.createdAt-a.createdAt).slice(0,10);
}
export async function revokeRestaurantShare(client:MealClient,token:string){if(!await client.isAdmin())throw new Error('Chỉ quản trị viên được tạo hoặc thu hồi link gửi nhà hàng.');const user=await ensureUser(client.auth),batch=writeBatch(client.db);batch.update(doc(client.db,'restaurantShares',token),{active:false});appendActivity(batch,client.db,user.uid,{kind:'share.revoke',summary:'Thu hồi link gửi nhà hàng'});await batch.commit();}
