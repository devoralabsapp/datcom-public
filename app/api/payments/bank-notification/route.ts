import {after} from 'next/server';
import {bankWebhook} from '../../../../lib/payment-webhook';
import {sendPaymentLog} from '../../../../lib/payment-telegram';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function POST(request:Request){return bankWebhook(request,process.env,event=>{after(async()=>{await sendPaymentLog(event);});});}
