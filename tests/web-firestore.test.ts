import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initializeApp,deleteApp,type FirebaseApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInAnonymously,signInWithCredential,linkWithCredential,GoogleAuthProvider} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,getDocs,collection,query,where,setDoc,updateDoc,deleteDoc,deleteField,writeBatch,serverTimestamp,Timestamp,terminate,setLogLevel,type Firestore} from 'firebase/firestore';
import {initializeTestEnvironment,assertFails,type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {MealClient} from '../lib/meal-client';
import type {Auth} from 'firebase/auth';
import {syncUserProfile,listManagedUsers,setUserAdmin,setUserBlocked} from '../lib/user-management';
import {PRIMARY_ADMIN_UID} from '../lib/user-model';
import {publicWorkspace,nameId} from '../lib/meal-client-model';
import {moveGuestOrders} from '../lib/client-auth';
import {readPickup,drawPickup} from '../lib/pickup-client';
import {pickupWeek,pickupDateOffset} from '../lib/pickup';
import {localNow} from '../lib/meal-client-model';

setLogLevel('silent');
const project='demo-datcom-tests';
const source=publicWorkspace({days:[{id:'day-2099-01-01',date:'2099-01-01',label:'Ngày kiểm thử',status:'auto',source:false,menu:[{name:'Cơm mẫu',price:40000},{name:'Salad mẫu',price:50000}]}],importedAt:'2026-10-22',demo:true},new Date('2099-01-01T00:00:00+07:00'));
function googleToken(id:string,email=id+'@example.test'){
 const encode=(o:unknown)=>Buffer.from(JSON.stringify(o)).toString('base64url');
 return encode({alg:'none',typ:'JWT'})+'.'+encode({iss:'https://accounts.google.com',aud:'test-google-client',sub:id,email,email_verified:true,name:'Google Sample',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})+'.';
}

test('Web SDK and Security Rules enforce the complete meal flow',{timeout:120000},async t=>{
 assert.ok(process.env.FIRESTORE_EMULATOR_HOST&&process.env.FIREBASE_AUTH_EMULATOR_HOST,'Run npm test for local Firebase emulators.');
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST!.split(':');
 const environment=await initializeTestEnvironment({projectId:project,firestore:{host,port:Number(port),rules:fs.readFileSync('firestore.rules','utf8')}});
 await environment.clearFirestore();
 const apps:FirebaseApp[]=[],databases:Firestore[]=[];
 async function client(id:string,google?:string){
  const app=initializeApp({projectId:project,apiKey:'fake-api-key',authDomain:project+'.firebaseapp.com'},id);apps.push(app);
  const auth=getAuth(app);connectAuthEmulator(auth,'http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST,{disableWarnings:true});
  const db=getFirestore(app);connectFirestoreEmulator(db,host,Number(port));databases.push(db);
  if(google)await signInWithCredential(auth,GoogleAuthProvider.credential(googleToken(google)));else await signInAnonymously(auth);
  return new MealClient(auth,db,source);
 }
 async function bootstrap(uid:string){await environment.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore() as unknown as Firestore,'admins',uid),{enabled:true});});}
 const dayId=source.day.id,menu=source.day.menu;
 const post=(c:MealClient,b:Record<string,unknown>)=>c.write({dayId,...b});
 try{
  const admin=await client('admin','admin-test'),a=await client('guest-a'),b=await client('guest-b');await bootstrap(admin.auth.currentUser!.uid);
  await t.test('default day stays today without publishing or falling back to another date',async()=>{
   const view=await a.read();assert.equal(view.day.date,localNow().date);assert.equal(view.storageReady,false);assert.deepEqual(view.day.menu,[]);assert.deepEqual(view.orders,[]);
   assert.equal((await getDoc(doc(a.db,'days',view.day.id))).exists(),false);
   assert.equal((await a.read(dayId)).day.id,dayId);
  });
  await t.test('all visitors can read meal orders without Google; roles stay private',async()=>{
   assert.equal((await a.read(dayId)).signedIn,false);assert.equal((await a.read(dayId)).admin,false);assert.deepEqual((await a.read(dayId)).orders,[]);
   await assertFails(setDoc(doc(a.db,'admins',a.auth.currentUser!.uid),{enabled:true}));
   await assertFails(setDoc(doc(admin.db,'admins',b.auth.currentUser!.uid),{enabled:true}));
   await assert.rejects(post(a,{action:'day',menu,status:'open'}));
   const opened=await post(admin,{action:'day',menu,status:'open',date:source.day.date});assert.equal(opened.storageReady,true);assert.equal(opened.admin,true);
   const w=await post(a,{action:'order',name:'Khách mẫu A',dish:menu[0].name,quantity:2,paid:true,price:1,ownerId:admin.auth.currentUser!.uid});
   assert.equal(w.orders[0].price,40000);assert.equal(w.orders[0].paid,false);assert.equal(w.orders[0].actor,a.auth.currentUser!.uid);assert.deepEqual(w.members,[]);assert.equal(w.sourceUrl,'');
   const shared=await b.read(dayId);assert.equal(shared.orders.length,1);assert.equal(shared.orders[0].canEdit,false);assert.equal(w.orders[0].canEdit,true);
   assert.equal((await getDocs(collection(b.db,'days',dayId,'orders'))).size,1);
   assert.equal((await getDoc(doc(b.db,'days',dayId,'orders',w.orders[0].id))).data()?.name,w.orders[0].name);
   await assertFails(getDocs(collection(b.db,'admins')));
   await assertFails(getDoc(doc(b.db,'admins',admin.auth.currentUser!.uid)));
   await assertFails(getDoc(doc(b.db,'accountLinks',a.auth.currentUser!.uid)));
   const unauth=environment.unauthenticatedContext().firestore() as unknown as Firestore;
   await assertFails(getDoc(doc(unauth,'days',dayId)));await assertFails(getDocs(collection(unauth,'days',dayId,'orders')));await assertFails(getDoc(doc(unauth,'settings','payment')));
  });
  const order=(await a.read(dayId)).orders[0],ref=doc(a.db,'days',dayId,'orders',order.id);
  await t.test('direct SDK attacks cannot change ownership, prices, payment, schema or timestamps',async()=>{
   for(const fields of [{ownerId:b.auth.currentUser!.uid},{price:1000},{quantity:0},{quantity:31},{quantity:1.5},{note:'x'.repeat(301)},{paid:true},{isAdmin:true},{name:'Hacked'},{createdAt:Timestamp.fromMillis(0)},{updatedAt:Timestamp.fromMillis(0)},{note:deleteField()},{dish:'Fake dish'}]){
    await assertFails(updateDoc(ref,{...fields,...('updatedAt' in fields?{}:{updatedAt:serverTimestamp()})}));
   }
   const other=doc(b.db,'days',dayId,'orders',order.id);await assertFails(updateDoc(other,{note:'hacked',updatedAt:serverTimestamp()}));await assertFails(updateDoc(other,{cancelled:true,paid:false,updatedAt:serverTimestamp()}));await assertFails(updateDoc(other,{paid:true,updatedAt:serverTimestamp()}));await assertFails(deleteDoc(other));await assertFails(deleteDoc(ref));
   await assert.rejects(post(b,{action:'order',id:order.id,name:order.name,dish:order.dish,note:'not mine'}));await assert.rejects(post(b,{action:'cancel',id:order.id}));
   const original=(await getDoc(ref)).data()!;
   const newId=await nameId('Forged');
   for(const fields of [{ownerId:a.auth.currentUser!.uid},{price:1},{paid:true},{quantity:-1},{extra:true},{cancelled:true}])await assertFails(setDoc(doc(b.db,'days',dayId,'orders',newId),{...original,name:'Forged',ownerId:b.auth.currentUser!.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),...fields}));
   await assertFails(setDoc(doc(a.db,'days',dayId,'dishes',await nameId(menu[0].name)),{name:menu[0].name,price:1000,active:true,updatedAt:serverTimestamp()}));
   await assertFails(setDoc(doc(a.db,'mealOrders','legacy'),{orders:{private:'blocked'}}));
  });
  await t.test('admin payments, edits and menu price changes preserve order integrity',async()=>{
   await post(admin,{action:'paid',id:order.id,paid:true});
   const changedMenu=[{...menu[0],price:45000},menu[1]];await post(admin,{action:'day',menu:changedMenu,status:'open'});
   const note=await post(a,{action:'order',id:order.id,name:order.name,dish:order.dish,quantity:2,note:'Ít cơm'});assert.equal(note.orders[0].price,40000);assert.equal(note.orders[0].paid,true);
   const qty=await post(a,{action:'order',id:order.id,name:order.name,dish:order.dish,quantity:1});assert.equal(qty.orders[0].paid,false);
   const dish=await post(a,{action:'order',id:order.id,name:order.name,dish:menu[1].name,quantity:1});assert.equal(dish.orders[0].price,50000);
   assert.equal((await post(admin,{action:'order',id:order.id,name:order.name,dish:menu[1].name,quantity:3})).orders.find(o=>o.id===order.id)?.quantity,3);
   const dayRef=doc(admin.db,'days',dayId);
   await assertFails(updateDoc(dayRef,{cutoffAt:Timestamp.fromMillis(0),updatedAt:serverTimestamp()}));
   await assertFails(updateDoc(dayRef,{status:'invalid',updatedAt:serverTimestamp()}));
   await assertFails(updateDoc(dayRef,{label:deleteField(),updatedAt:serverTimestamp()}));
   const paidRef=doc(admin.db,'settings','payment');await setDoc(paidRef,{qrUrl:'https://example.test/qr.png',updatedAt:serverTimestamp()});assert.equal((await a.read(dayId)).paymentAvailable,true);
   await assertFails(updateDoc(paidRef,{qrUrl:'javascript:alert(1)',updatedAt:serverTimestamp()}));await assertFails(updateDoc(doc(a.db,'settings','payment'),{qrUrl:'https://fake.test',updatedAt:serverTimestamp()}));
  });
  await t.test('concurrent duplicate names are rejected atomically and clock bypasses fail',async()=>{
   const result=await Promise.allSettled([post(a,{action:'order',name:'Đặt trùng mẫu',dish:menu[0].name}),post(b,{action:'order',name:'đặt trùng mẫu',dish:menu[0].name})]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
   await post(admin,{action:'day',menu,status:'closed'});
   await assert.rejects(post(a,{action:'order',id:order.id,name:order.name,dish:order.dish}));
   await assertFails(updateDoc(ref,{note:'clock bypass',updatedAt:serverTimestamp()}));await assertFails(updateDoc(ref,{cancelled:true,paid:false,updatedAt:serverTimestamp()}));
   const original=(await getDoc(ref)).data()!;await assertFails(setDoc(doc(a.db,'days',dayId,'orders',await nameId('After cutoff')),{...original,name:'After cutoff',createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
   await post(admin,{action:'paid',id:order.id,paid:true});
   await post(admin,{action:'day',menu,status:'open'});await post(a,{action:'cancel',id:order.id});assert.equal((await a.read(dayId)).orders.some(o=>o.id===order.id),false);
   await post(a,{action:'order',name:order.name,dish:menu[0].name});
   await post(admin,{action:'day',create:true,date:'2000-01-01',menu,status:'auto'});
   await assert.rejects(a.write({dayId:'day-2000-01-01',action:'order',name:'Past day',dish:menu[0].name}));
  });
  await t.test('Google links new accounts without losing anonymous orders; other devices see them',async()=>{
   const uid=a.auth.currentUser!.uid;await linkWithCredential(a.auth.currentUser!,GoogleAuthProvider.credential(googleToken('linked-google')));assert.equal(a.auth.currentUser!.uid,uid);
   assert.ok((await a.read(dayId)).orders.some(o=>o.id===order.id));assert.equal((await a.read(dayId)).signedIn,true);
   const device=await client('second-device','linked-google');assert.equal(device.auth.currentUser!.uid,uid);assert.equal((await device.read(dayId)).orders.find(o=>o.id===order.id)?.canEdit,true);
  });
  await t.test('existing Google account merges require a source-authorized, expiring ticket',async()=>{
   const guest=await client('merge-guest'),target=await client('merge-google','merge-target');
   const placed=await post(guest,{action:'order',name:'Merge sample',dish:menu[0].name}),o=placed.orders.find(x=>x.name==='Merge sample')!,guestUid=guest.auth.currentUser!.uid,targetUid=target.auth.currentUser!.uid;
   const targetRef=doc(target.db,'days',dayId,'orders',o.id);
   await assertFails(updateDoc(targetRef,{ownerId:targetUid,updatedAt:serverTimestamp()}));
   await assertFails(setDoc(doc(b.db,'accountLinks',guestUid),{targetUid,createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+300000)}));
   await assertFails(setDoc(doc(guest.db,'accountLinks',guestUid),{targetUid,createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+86400000)}));
   await setDoc(doc(guest.db,'accountLinks',guestUid),{targetUid,createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+300000)});
   await assertFails(updateDoc(doc(guest.db,'accountLinks',guestUid),{targetUid:b.auth.currentUser!.uid}));
   await assertFails(updateDoc(targetRef,{ownerId:targetUid,paid:true,updatedAt:serverTimestamp()}));
   await post(admin,{action:'day',menu,status:'closed'});
   await moveGuestOrders(target.db,guestUid,targetUid);assert.equal((await getDoc(targetRef)).data()?.ownerId,targetUid);assert.equal((await getDoc(doc(guest.db,'days',dayId,'orders',o.id))).data()?.ownerId,targetUid);await assertFails(updateDoc(doc(guest.db,'days',dayId,'orders',o.id),{note:'old owner',updatedAt:serverTimestamp()}));
   assert.equal((await getDoc(doc(guest.db,'accountLinks',guestUid))).exists(),false);
   await post(admin,{action:'day',menu,status:'open'});
  });
  await t.test('unverified or non-Google identities cannot use admin membership',async()=>{
   for(const [uid,provider,verified] of [['fake-admin','anonymous',true],['unverified-admin','google.com',false],['password-admin','password',true]] as const){
    await bootstrap(uid);const db=environment.authenticatedContext(uid,{email:'test@example.test',email_verified:verified,firebase:{sign_in_provider:provider}}).firestore() as unknown as Firestore;
    assert.ok((await getDocs(collection(db,'days',dayId,'orders'))).size>0);await assertFails(updateDoc(doc(db,'days',dayId),{status:'closed',updatedAt:serverTimestamp()}));
   }
  });
  await t.test('expired handoffs, anonymous recipients and orphaned records stay blocked',async()=>{
   const guest=await client('expired-source'),target=await client('expired-target','expired-google');
   const w=await post(guest,{action:'order',name:'Expiry sample',dish:menu[0].name}),o=w.orders.find(x=>x.name==='Expiry sample')!,uid=guest.auth.currentUser!.uid;
   const ticket=doc(guest.db,'accountLinks',uid);
   await setDoc(ticket,{targetUid:b.auth.currentUser!.uid,createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+300000)});
   await assertFails(updateDoc(doc(b.db,'days',dayId,'orders',o.id),{ownerId:b.auth.currentUser!.uid,updatedAt:serverTimestamp()}));await deleteDoc(ticket);
   await environment.withSecurityRulesDisabled(async c=>{
    const db=c.firestore() as unknown as Firestore;
    await setDoc(doc(db,'accountLinks',uid),{targetUid:target.auth.currentUser!.uid,createdAt:Timestamp.fromMillis(0),expiresAt:Timestamp.fromMillis(1)});
    await setDoc(doc(db,'days','orphan','orders',o.id),(await getDoc(doc(db,'days',dayId,'orders',o.id))).data()!);
   });
   await assertFails(updateDoc(doc(target.db,'days',dayId,'orders',o.id),{ownerId:target.auth.currentUser!.uid,updatedAt:serverTimestamp()}));
   await assertFails(getDoc(doc(guest.db,'days','orphan','orders',o.id)));await assertFails(getDocs(collection(admin.db,'days','orphan','dishes')));
   await deleteDoc(doc(target.db,'accountLinks',uid));
  });
  await t.test('all visitors see the same statistics across days, excluding cancelled orders',async()=>{
   const guest=await client('statistics-guest'),other=await client('statistics-other');
   await post(admin,{action:'day',create:true,date:'2099-01-02',menu,status:'open'});
   await post(guest,{action:'order',name:'Thống kê ngày một',dish:menu[0].name,quantity:2});
   await guest.write({dayId:'day-2099-01-02',action:'order',name:'Thống kê ngày hai',dish:menu[1].name,quantity:1});
   const cancelled=await other.write({dayId:'day-2099-01-02',action:'order',name:'đơn thống kê đã hủy',dish:menu[0].name});
   await other.write({dayId:'day-2099-01-02',action:'cancel',id:cancelled.orders.find(x=>x.name==='đơn thống kê đã hủy')!.id});
   const shared=await guest.statistics(),sample=shared.filter(o=>o.name.startsWith('Thống kê ngày'));assert.equal(sample.length,2);assert.equal(sample.reduce((s,o)=>s+o.amount,0),130000);assert.deepEqual(new Set(sample.map(o=>o.date)),new Set(['2099-01-01','2099-01-02']));
   assert.deepEqual(await other.statistics(),shared);assert.deepEqual(await admin.statistics(),shared);
   const googleViewer=await client('statistics-google-viewer','statistics-google');assert.equal((await googleViewer.read(dayId)).admin,false);assert.deepEqual(await googleViewer.statistics(),shared);
   const otherView=await other.read('day-2099-01-02');assert.equal(otherView.orders.find(o=>o.name==='Thống kê ngày hai')?.canEdit,false);
   await assert.rejects(other.write({dayId:'day-2099-01-02',action:'cancel',id:otherView.orders.find(o=>o.name==='Thống kê ngày hai')!.id}));
   const all=await admin.statistics();assert.ok(all.some(o=>o.name==='Thống kê ngày một'));assert.ok(all.some(o=>o.name==='Thống kê ngày hai'));assert.equal(all.some(o=>o.name==='đơn thống kê đã hủy'),false);
  });
  await t.test('pickup draws balance weekly turns, serialize concurrent spins and keep immutable history',async()=>{
   const today=localNow().date,pickupDay='day-'+today,week=pickupWeek(today),players=[];
   await admin.write({action:'day',create:true,date:today,menu,status:'open'});
   for(let i=0;i<6;i++){const player=await client('pickup-player-'+i);players.push(player);await player.write({dayId:pickupDay,action:'order',name:'Pickup '+i,dish:menu[0].name,quantity:i===0?3:1});}
   if(today!==week.start)await environment.withSecurityRulesDisabled(async c=>{const selected=[{key:'pickup 0',name:'Pickup 0',previousCount:0},{key:'pickup 1',name:'Pickup 1',previousCount:0}];await setDoc(doc(c.firestore() as unknown as Firestore,'pickupDraws',pickupDateOffset(today,-1)),{date:pickupDateOffset(today,-1),weekStart:week.start,dayId:'sample-prior-day',count:2,candidateCount:6,selectedNames:selected.map(p=>p.name),previousCounts:selected.map(p=>p.previousCount),selectedKeys:selected.map(p=>p.key),createdAt:Timestamp.now(),createdBy:admin.auth.currentUser!.uid,version:1});});
   const state=await readPickup(players[0],pickupDay);assert.equal(state.candidates.length,6);assert.equal(state.draw,null);assert.equal(state.candidates.find(p=>p.key==='pickup 0')?.weeklyCount,today===week.start?0:1);
   await assert.rejects(drawPickup(players[0],pickupDay,2));await assert.rejects(drawPickup(admin,pickupDay,7));assert.equal((await admin.read(pickupDay)).day.status,'open');
   const ref=doc(admin.db,'pickupDraws',today),selected=[{key:'pickup 2',name:'Pickup 2',previousCount:0},{key:'pickup 3',name:'Pickup 3',previousCount:0}];
   const base={date:today,weekStart:week.start,dayId:pickupDay,count:2,candidateCount:6,selectedNames:selected.map(p=>p.name),previousCounts:selected.map(p=>p.previousCount),selectedKeys:selected.map(p=>p.key),createdAt:serverTimestamp(),createdBy:admin.auth.currentUser!.uid,version:1};
   await assertFails(setDoc(ref,base)); // Must close the order roster first.
   await admin.write({dayId:pickupDay,action:'day',menu,status:'closed'});
   await assertFails(setDoc(doc(players[0].db,'pickupDraws',today),{...base,createdBy:players[0].auth.currentUser!.uid}));
   for(const extra of [{createdBy:players[0].auth.currentUser!.uid},{createdAt:Timestamp.fromMillis(0)},{count:21},{count:0},{selectedKeys:['pickup 2','pickup 2']},{extra:true},{weekStart:pickupDateOffset(week.start,1)},{selectedNames:['x'.repeat(101),selected[1].name]},{previousCounts:[-1,0]}])await assertFails(setDoc(ref,{...base,...extra}));
   // The largest supported result validates every list element, including the last.
   for(const extra of [{dayId:'missing-pickup-day'},{selectedNames:[42,'Pickup 3']},{previousCounts:[.5,0]},{selectedKeys:['pickup 2',42]}])await assertFails(setDoc(ref,{...base,...extra}));
   const ten=Array.from({length:10},(_,i)=>({key:'fixture '+i,name:'Fixture '+i,previousCount:0}));
   await assertFails(setDoc(ref,{...base,count:10,candidateCount:10,selectedNames:[...ten.slice(0,9).map(p=>p.name),'x'.repeat(101)],previousCounts:ten.map(p=>p.previousCount),selectedKeys:ten.map(p=>p.key)}));
   try{await setDoc(ref,{...base,count:10,candidateCount:10,selectedNames:ten.map(p=>p.name),previousCounts:ten.map(p=>p.previousCount),selectedKeys:ten.map(p=>p.key)});}catch(e){throw new Error('Ten-person result validation failed: '+(e as Error).message);}
   await environment.withSecurityRulesDisabled(async c=>{await deleteDoc(doc(c.firestore() as unknown as Firestore,'pickupDraws',today));});
   await admin.write({dayId:pickupDay,action:'day',menu,status:'open'});
   const [first,second]=await Promise.all([drawPickup(admin,pickupDay,2),drawPickup(admin,pickupDay,2)]);
   assert.deepEqual(first.draw.selectedKeys,second.draw.selectedKeys);assert.equal(Number(first.created)+Number(second.created),1);assert.equal(first.draw.count,2);assert.equal(new Set(first.draw.selectedKeys).size,2);assert.ok(first.draw.selected.every(p=>p.previousCount===0));
   if(today!==week.start)assert.ok(first.draw.selected.every(p=>!['pickup 0','pickup 1'].includes(p.key)));
   const saved=await readPickup(players[0],pickupDay);assert.deepEqual(saved.draw?.selectedKeys,first.draw.selectedKeys);assert.equal(saved.history.filter(d=>d.date===today).length,1);assert.equal((await admin.read(pickupDay)).day.status,'closed');
   const replay=await drawPickup(admin,pickupDay,1);assert.equal(replay.created,false);assert.deepEqual(replay.draw.selectedKeys,first.draw.selectedKeys);
   await assertFails(updateDoc(ref,{count:1,updatedAt:serverTimestamp()}));await assertFails(deleteDoc(ref));await assertFails(deleteDoc(doc(players[0].db,'pickupDraws',today)));
   const unauth=environment.unauthenticatedContext().firestore() as unknown as Firestore;await assertFails(getDocs(collection(unauth,'pickupDraws')));
   const tomorrow=pickupDateOffset(today,1);await assertFails(setDoc(doc(admin.db,'pickupDraws',tomorrow),{...base,date:tomorrow,weekStart:pickupWeek(tomorrow).start}));
  });
  await t.test('user profiles stay private, validate identity and preserve own preferred names',async()=>{
   const guest=await client('profile-guest'),google=await client('profile-google','profile-google');
   await syncUserProfile(guest,'Khách nhớ tên');await syncUserProfile(google,'Tên Google');
   const uid=guest.auth.currentUser!.uid,ref=doc(guest.db,'userProfiles',uid),saved=(await getDoc(ref)).data()!;
   assert.equal(saved.preferredName,'Khách nhớ tên');assert.equal(saved.email,'');assert.equal(saved.provider,'anonymous');
   await assertFails(getDocs(collection(guest.db,'userProfiles')));await assertFails(getDoc(doc(google.db,'userProfiles',uid)));await assertFails(getDocs(collection(google.db,'userAccess')));
   await assert.rejects(listManagedUsers(guest));await assert.rejects(setUserBlocked(guest,google.auth.currentUser!.uid,true));
   for(const extra of [{isAdmin:true},{displayName:'x'.repeat(101)},{preferredName:42},{email:'forged@example.test'},{provider:'google.com'},{createdAt:Timestamp.fromMillis(0)},{lastSeenAt:Timestamp.fromMillis(0)}])await assertFails(updateDoc(ref,{...extra,...('lastSeenAt' in extra?{}:{lastSeenAt:serverTimestamp()})}));
   await assertFails(updateDoc(ref,{email:deleteField(),lastSeenAt:serverTimestamp()}));await assertFails(deleteDoc(ref));
   await assertFails(setDoc(doc(guest.db,'userProfiles',google.auth.currentUser!.uid),{...saved,createdAt:serverTimestamp(),lastSeenAt:serverTimestamp()}));
   const googleRef=doc(google.db,'userProfiles',google.auth.currentUser!.uid);await assertFails(updateDoc(googleRef,{email:'someone-else@example.test',lastSeenAt:serverTimestamp()}));
   await syncUserProfile(admin,'Tên quản trị riêng');await admin.write({action:'day',create:true,date:'2098-02-01',menu,status:'open'});
   const placed=await guest.write({dayId:'day-2098-02-01',action:'order',name:'Khách nhớ tên',dish:menu[0].name});
   await admin.write({dayId:'day-2098-02-01',action:'order',id:placed.orders[0].id,name:'Khách nhớ tên',dish:menu[0].name,quantity:2});
   assert.equal((await getDoc(doc(admin.db,'userProfiles',admin.auth.currentUser!.uid))).data()?.preferredName,'Tên quản trị riêng');
   const broken=new MealClient(guest.auth,guest.db,source);broken.read=async()=>{throw new Error('refresh unavailable');};
   await assert.rejects(broken.write({dayId:'day-2098-02-01',action:'order',name:'Tên lưu sau đặt',dish:menu[0].name}));
   assert.equal((await getDoc(ref)).data()?.preferredName,'Tên lưu sau đặt');
   assert.equal((await getDoc(doc(guest.db,'days','day-2098-02-01','orders',await nameId('Tên lưu sau đặt')))).exists(),true);
   const unauth=environment.unauthenticatedContext().firestore() as unknown as Firestore;await assertFails(getDocs(collection(unauth,'userProfiles')));await assertFails(getDoc(doc(unauth,'userAccess',uid)));
  });
  await t.test('primary-only roles and account blocks resist direct SDK and atomic batch bypasses',async()=>{
   const rootUid=PRIMARY_ADMIN_UID,claims={email:'primary@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'}} as const;
   await bootstrap(rootUid);const db=environment.authenticatedContext(rootUid,claims).firestore() as unknown as Firestore;
   const rootUser={uid:rootUid,isAnonymous:false,email:claims.email,displayName:'Primary',getIdTokenResult:async()=>({claims:{email_verified:true},signInProvider:'google.com'})};
   const root=new MealClient({currentUser:rootUser,authStateReady:async()=>{}} as unknown as Auth,db,source);
   const google=await client('role-google','role-google'),guest=await client('role-guest');await syncUserProfile(root);await syncUserProfile(google,'Người quản lý mới');await syncUserProfile(guest,'Khách giới hạn');
   const uid=google.auth.currentUser!.uid,guestUid=guest.auth.currentUser!.uid,roleRef=doc(db,'admins',uid),role={enabled:true,updatedBy:rootUid,updatedAt:serverTimestamp()};
   await assert.rejects(setUserAdmin(admin,uid,true));await assert.rejects(setUserAdmin(root,guestUid,true));await assert.rejects(setUserAdmin(root,'unknown-user',true));
   await assertFails(setDoc(doc(admin.db,'admins',uid),{...role,updatedBy:admin.auth.currentUser!.uid}));await assertFails(setDoc(doc(google.db,'admins',uid),{...role,updatedBy:uid}));
   for(const extra of [{extra:true},{enabled:'yes'},{updatedBy:uid},{updatedAt:Timestamp.fromMillis(0)}])await assertFails(setDoc(roleRef,{...role,...extra}));
   await assertFails(updateDoc(doc(db,'admins',rootUid),{enabled:false,updatedBy:rootUid,updatedAt:serverTimestamp()}));await assertFails(deleteDoc(doc(db,'admins',rootUid)));
   await assert.rejects(setUserBlocked(root,rootUid,true));await assertFails(setDoc(doc(db,'userAccess',rootUid),{blocked:true,updatedBy:rootUid,updatedAt:serverTimestamp()}));
   const batch=writeBatch(db);batch.set(roleRef,role);batch.set(doc(db,'userAccess',uid),{blocked:true,updatedBy:rootUid,updatedAt:serverTimestamp()});await assertFails(batch.commit());
   await setUserAdmin(root,uid,true);assert.equal(await google.isAdmin(),true);assert.ok((await listManagedUsers(google)).users.some(p=>p.uid===rootUid));
   await assert.rejects(setUserBlocked(admin,uid,true));await assertFails(setDoc(doc(admin.db,'userAccess',uid),{blocked:true,updatedBy:admin.auth.currentUser!.uid,updatedAt:serverTimestamp()}));
   await assert.rejects(setUserAdmin(google,guestUid,true));
   await setUserAdmin(root,uid,false);assert.equal(await google.isAdmin(),false);
   const managedDay='day-2098-02-01',order=await google.write({dayId:managedDay,action:'order',name:'Đơn trước khóa',dish:menu[0].name});const own=order.orders.find(o=>o.actor===uid)!;
   await setUserBlocked(admin,uid,true);assert.equal((await google.read(managedDay)).blocked,true);
   await assert.rejects(google.write({dayId:managedDay,action:'order',name:'Đơn mới bị chặn',dish:menu[0].name}));
   const ref=doc(google.db,'days',managedDay,'orders',own.id),original=(await getDoc(ref)).data()!;
   await assertFails(updateDoc(ref,{note:'bypass',updatedAt:serverTimestamp()}));await assertFails(setDoc(doc(google.db,'days',managedDay,'orders',await nameId('Direct blocked')),{...original,name:'Direct blocked',createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
   await assertFails(setDoc(doc(google.db,'userAccess',uid),{blocked:false,updatedBy:uid,updatedAt:serverTimestamp()}));
   await assert.rejects(setUserAdmin(root,uid,true));
   await google.write({dayId:managedDay,action:'cancel',id:own.id});assert.equal((await getDoc(ref)).data()?.cancelled,true);
   await setUserBlocked(admin,uid,false);await google.write({dayId:managedDay,action:'order',name:'Đơn mở lại',dish:menu[0].name});
   const accessRef=doc(db,'userAccess',uid);for(const extra of [{blocked:1},{extra:true},{updatedBy:uid},{updatedAt:Timestamp.fromMillis(0)}])await assertFails(updateDoc(accessRef,{...extra,...('updatedAt' in extra?{}:{updatedAt:serverTimestamp()})}));await assertFails(deleteDoc(accessRef));
   await assert.rejects(listManagedUsers(google));const directory=await listManagedUsers(root);assert.equal(directory.canManageRoles,true);assert.ok(directory.users.some(p=>p.uid===uid&&p.orderCount>=1));assert.equal((await listManagedUsers(admin)).canManageRoles,false);
   await assertFails(getDocs(collection(guest.db,'admins')));await assertFails(getDoc(doc(guest.db,'userAccess',uid)));
  });
 }finally{const coverage=await fetch(`http://${host}:${port}/emulator/v1/projects/${project}:ruleCoverage`);fs.mkdirSync('.firebase',{recursive:true});fs.writeFileSync('.firebase/rules-coverage.json',await coverage.text());await Promise.all(databases.map(db=>terminate(db)));await Promise.all(apps.map(app=>deleteApp(app)));await environment.cleanup();}
});
