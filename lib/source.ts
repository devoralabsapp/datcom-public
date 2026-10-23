import {readFile} from 'node:fs/promises';
import path from 'node:path';
import example from '../data/source.example.json';
import type {Day,Order} from './types';
type SourceData={importedAt:string;spreadsheetUrl:string;demo?:boolean;days:(Day&{orders:Order[];members:string[]})[]};
export async function loadSource():Promise<SourceData>{
 try{
  const raw=await readFile(path.join(process.cwd(),'data/source.json'),'utf8');
  const parsed=JSON.parse(raw) as SourceData;
  if(!Array.isArray(parsed.days)||!parsed.days.length)throw new Error('Invalid source data.');
  return parsed;
 }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return example as SourceData;}
}
