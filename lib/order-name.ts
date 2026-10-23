const key='com-nha:name:v1';
type NameStorage=Pick<Storage,'getItem'|'setItem'>;
export function normalizedOrderName(value:unknown){return typeof value==='string'?value.normalize('NFC').trim():'';}
function browserStorage(){try{return typeof window==='undefined'?undefined:window.localStorage;}catch{return undefined;}}
export function rememberedOrderName(storage:NameStorage|undefined=browserStorage()){
 try{const name=normalizedOrderName(storage?.getItem(key));return name.length<=100?name:'';}catch{return '';}
}
export function rememberOrderName(value:string,storage:NameStorage|undefined=browserStorage()){
 const name=normalizedOrderName(value);if(!name||name.length>100)return;
 try{storage?.setItem(key,name);}catch{/* Ordering still succeeds when browser storage is unavailable. */}
}
