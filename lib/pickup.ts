import {validDate} from './meal-client-model';
import {personKey} from './statistics';

export const MAX_PICKUP_PEOPLE=10;
export type PickupPerson={key:string;name:string};
export type PickupCandidate=PickupPerson&{weeklyCount:number;lastDate:string};
export type PickupSelection=PickupPerson&{previousCount:number};
export type PickupDraw={date:string;weekStart:string;dayId:string;count:number;candidateCount:number;selected:PickupSelection[];selectedKeys:string[];createdAt:string;createdBy:string;version:1};
export type PickupState={dayId:string;date:string;weekStart:string;weekEnd:string;candidates:PickupCandidate[];history:PickupDraw[];draw:PickupDraw|null;closed:boolean};
export function pickupDateOffset(date:string,offset:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
export function pickupWeek(date:string){
 if(!validDate(date))throw new Error('Ngày lấy cơm chưa hợp lệ.');
 const monday=pickupDateOffset(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));
 return {start:monday,end:pickupDateOffset(monday,7),dates:Array.from({length:7},(_,i)=>pickupDateOffset(monday,i))};
}
export function pickupCandidates(orders:{name:string;cancelled?:boolean}[],history:PickupDraw[]):PickupCandidate[]{
 const names=new Map<string,string>();
 for(const o of orders){const name=o.name.normalize('NFC').trim().replace(/\s+/g,' ');if(!o.cancelled&&name)names.set(personKey(name),names.get(personKey(name))||name);}
 return [...names].map(([key,name])=>{const served=history.filter(d=>d.selected.some(p=>p.key===key));return {key,name,weeklyCount:served.length,lastDate:served.map(d=>d.date).sort().at(-1)||''};}).sort((a,b)=>a.weeklyCount-b.weeklyCount||a.name.localeCompare(b.name,'vi'));
}
export function pickupPriority(candidates:PickupCandidate[]){const min=Math.min(...candidates.map(p=>p.weeklyCount));return candidates.filter(p=>p.weeklyCount===min);}
export function secureRandomIndex(upper:number){
 if(!Number.isInteger(upper)||upper<1||upper>500)throw new Error('Số người tham gia chưa hợp lệ.');
 const limit=0x100000000-(0x100000000%upper),buffer=new Uint32Array(1);do{crypto.getRandomValues(buffer);}while(buffer[0]>=limit);return buffer[0]%upper;
}
export function choosePickup(candidates:PickupCandidate[],count:number,randomIndex=secureRandomIndex):PickupSelection[]{
 if(!Number.isInteger(count)||count<1||count>MAX_PICKUP_PEOPLE||count>candidates.length)throw new Error(`Chọn từ 1 đến ${Math.min(MAX_PICKUP_PEOPLE,candidates.length)} người, không vượt quá danh sách tham gia.`);
 if(new Set(candidates.map(p=>p.key)).size!==candidates.length||candidates.some(p=>!Number.isInteger(p.weeklyCount)||p.weeklyCount<0))throw new Error('Danh sách tham gia hoặc số lượt chưa hợp lệ.');
 const remaining=[...candidates],selected:PickupSelection[]=[];
 while(selected.length<count){const tier=pickupPriority(remaining),index=randomIndex(tier.length);if(!Number.isInteger(index)||index<0||index>=tier.length)throw new Error('Chưa chọn được vị trí ngẫu nhiên.');const person=tier[index];selected.push({key:person.key,name:person.name,previousCount:person.weeklyCount});remaining.splice(remaining.findIndex(p=>p.key===person.key),1);}
 return selected;
}
