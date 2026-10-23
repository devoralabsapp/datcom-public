import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
import {parseRestaurantSummary} from '../../../lib/restaurant-summary';
import RestaurantShareView from '../../restaurant-share-view';
export const dynamic='force-dynamic';
export const metadata:Metadata={robots:{index:false,follow:false}};
export default async function SharePage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;if(!/^[a-f0-9]{32}$/.test(token))notFound();
 const project=process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,database=process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID||'(default)';
 if(!project||!/^[a-z0-9-]{6,100}$/.test(project)||!/^[A-Za-z0-9_()-]{1,100}$/.test(database))notFound();
 const host=process.env.FIRESTORE_EMULATOR_HOST,local=process.env.NODE_ENV!=='production'&&project.startsWith('demo-')&&host&&/^127\.0\.0\.1:\d+$/.test(host),base=local?'http://'+host:'https://firestore.googleapis.com';
 const response=await fetch(`${base}/v1/projects/${project}/databases/${database}/documents/restaurantShares/${token}`,{cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!response.ok)notFound();const data=await response.json(),fields=data.fields;
 if(fields?.active?.booleanValue!==true||Date.parse(fields?.expiresAt?.timestampValue||'')<=Date.now())notFound();
 let summary;try{summary=parseRestaurantSummary(JSON.parse(fields.payload.stringValue));}catch{notFound();}
 return <RestaurantShareView summary={summary}/>;
}
