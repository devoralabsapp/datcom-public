import test from 'node:test';
import assert from 'node:assert/strict';
import {bankWebhook} from '../lib/payment-webhook';
import {paymentLogMessage,sendPaymentLog,type PaymentLogEvent} from '../lib/payment-telegram';

const reference='COM'+'A'.repeat(20),secret='w'.repeat(64),botToken='123456789:'+'T'.repeat(35);
const env={PAYMENT_WEBHOOK_SECRET:secret,PAYMENT_TELEGRAM_BOT_TOKEN:botToken,PAYMENT_TELEGRAM_CHAT_ID:'-1001234567890',PAYMENT_FIREBASE_REFRESH_TOKEN:'fake-refresh-token-value'};
const notice=`Account 00012345678901\nAmount: + 30,000\nBalance: 39,184\nNGUYEN VAN MAU transfer ${reference}`;
const event:PaymentLogEvent={requestId:'fake-request-id',receivedAt:'2026-10-23T07:00:00.000Z',httpStatus:200,result:{status:'paid',reference,amount:30000},notification:notice,parsed:{reference,amount:30000,accountNumber:'00012345678901',bankBin:'970407'}};

test('Telegram payment logs retain diagnostic content while concealing accounts, balance and credentials',()=>{
 const raw=notice+'\nBearer '+secret+'\n'+env.PAYMENT_FIREBASE_REFRESH_TOKEN+'\n'+botToken;
 const message=paymentLogMessage({...event,notification:raw},env);
 assert.match(message,/ĐÃ XÁC NHẬN THANH TOÁN/);assert.ok(message.includes(reference));assert.match(message,/30\.000 đ/);assert.match(message,/14:00:00/);assert.match(message,/Techcombank/);assert.match(message,/\*\*\*8901/);assert.match(message,/đã che số dư/);assert.match(message,/NGUYEN VAN MAU transfer/);
 for(const privateValue of ['00012345678901','39,184',secret,env.PAYMENT_FIREBASE_REFRESH_TOKEN,botToken])assert.ok(!message.includes(privateValue));
 const bidv=paymentLogMessage({...event,notification:'Account thanh toán: 000999999999\nTransaction Amount: +40,000 VND\nEnding Balance: 9,999,999 VND\nNội dung: '+reference},env);
 assert.ok(!bidv.includes('000999999999'));assert.ok(!bidv.includes('9,999,999'));
 const currencyFirst=paymentLogMessage({...event,notification:`+ VND 50,000\nAccount: 00012345678901\nBalance: VND 52,000\n${reference}`.repeat(4)},env);
 assert.ok(!currencyFirst.includes('52,000'));assert.ok(!currencyFirst.includes('00012345678901'));assert.equal(currencyFirst.match(/đã che số dư/g)?.length,1);assert.equal(currencyFirst.match(/\+ VND 50,000/g)?.length,1);assert.ok(currencyFirst.includes(reference));
 const block=`+ VND 50,000\nAccount: 00012345678901\nBalance: VND 52,000\n${reference}`;
 const conflicting=paymentLogMessage({...event,notification:block+block.replace('52,000','53,000')},env);
 assert.equal(conflicting.match(/đã che số dư/g)?.length,2);assert.ok(!conflicting.includes('52,000'));assert.ok(!conflicting.includes('53,000'));
 for(const balance of ['Balance: VND 2,000','Balance: + VND 2,000','Balance: VND +2,000','Số dư: VND 2,000'])assert.ok(!paymentLogMessage({...event,notification:balance},env).includes('2,000'));
 const long=paymentLogMessage({...event,notification:'😀'.repeat(12000)},env);assert.ok(long.length<=4096);assert.match(long,/đã rút gọn/);
 const unmatched=paymentLogMessage({...event,parsed:undefined,result:{status:'unmatched',reason:'notification_not_supported',message:'Không tìm thấy một mã đơn duy nhất trong thông báo.'},httpStatus:422},env);assert.match(unmatched,/CHƯA XÁC NHẬN/);assert.match(unmatched,/Không tìm thấy/);assert.match(unmatched,/HTTP: 422/);
});

test('Telegram sends bounded plain-text channel messages only when configured for production',async()=>{
 const calls:{url:string;options:RequestInit}[]=[];
 const fakeFetch:typeof fetch=async(input,options)=>{calls.push({url:String(input),options:options!});return Response.json({ok:true,result:{message_id:1}});};
 assert.equal(await sendPaymentLog(event,{},fakeFetch),'disabled');assert.equal(await sendPaymentLog(event,{...env,VERCEL_ENV:'preview'},fakeFetch),'disabled');assert.equal(calls.length,0);
 assert.equal(await sendPaymentLog(event,{...env,VERCEL_ENV:'production'},fakeFetch),'sent');assert.equal(calls.length,1);
 const call=calls[0],body=JSON.parse(String(call.options.body));assert.equal(call.url,'https://api.telegram.org/bot'+botToken+'/sendMessage');assert.equal(call.options.method,'POST');assert.equal(call.options.redirect,'error');assert.ok(call.options.signal);assert.equal(body.chat_id,env.PAYMENT_TELEGRAM_CHAT_ID);assert.equal(body.protect_content,true);assert.equal(body.parse_mode,undefined);assert.equal(body.link_preview_options.is_disabled,true);assert.ok(!body.text.includes('00012345678901'));assert.ok(!body.text.includes(secret));
 await sendPaymentLog({...event,result:{status:'duplicate',reason:'reference_already_processed'}},env,fakeFetch);assert.equal(JSON.parse(String(calls[1].options.body)).disable_notification,true);
});

test('Telegram failures never expose provider errors or retry a possibly delivered message',async t=>{
 const warnings:unknown[][]=[];t.mock.method(console,'warn',(...args:unknown[])=>warnings.push(args));let calls=0;
 const failure:typeof fetch=async()=>{calls++;throw new Error('Do not log URL containing '+botToken);};
 assert.equal(await sendPaymentLog(event,env,failure),'failed');assert.equal(calls,1);
 assert.equal(await sendPaymentLog(event,env,async()=>Response.json({ok:false,description:botToken},{status:429})),'failed');
 assert.equal(await sendPaymentLog(event,env,async()=>Response.json({ok:false,description:botToken})),'failed');
 assert.equal(await sendPaymentLog(event,{...env,PAYMENT_TELEGRAM_CHAT_ID:'https://t.me/+fake'},failure),'failed');assert.equal(calls,1);
 assert.ok(!JSON.stringify(warnings).includes(botToken));assert.ok(!JSON.stringify(warnings).includes(secret));
});

test('Only authenticated webhook requests schedule logs; malformed bodies omit raw data',async t=>{
 const events:PaymentLogEvent[]=[],collect=(value:PaymentLogEvent)=>{events.push(value);};
 const request=(body:string,authorization='Bearer '+secret,type='application/json')=>new Request('https://example.test/api/payments/bank-notification',{method:'POST',headers:{Authorization:authorization,'Content-Type':type},body});
 assert.equal((await bankWebhook(request('{}',''),env,collect)).status,401);assert.equal(events.length,0);
 assert.equal((await bankWebhook(request('{}'),{},collect)).status,503);assert.equal(events.length,0);
 assert.equal((await bankWebhook(request('{'),env,collect)).status,400);assert.equal(events.at(-1)?.notification,undefined);
 assert.equal((await bankWebhook(request('{}',undefined,'text/html'),env,collect)).status,415);
 assert.equal((await bankWebhook(request('x'.repeat(16001),undefined,'text/plain'),env,collect)).status,413);
 // Valid config is checked before notification parsing; no Firebase call is made
 // for the missing-reference notice, which still produces a diagnostic event.
 const configured={...env,NEXT_PUBLIC_FIREBASE_PROJECT_ID:'fake-project',NEXT_PUBLIC_FIREBASE_API_KEY:'fake-api-key'};
 const response=await bankWebhook(request(JSON.stringify({notification:notice.replace(reference,'')})),configured,collect);
 assert.equal(response.status,422);assert.equal(events.at(-1)?.httpStatus,422);assert.ok(events.at(-1)?.notification?.includes('Amount:'));assert.equal(events.at(-1)?.parsed,undefined);
 assert.match(events.at(-1)!.requestId,/^[a-f0-9-]{36}$/);assert.ok(Number.isFinite(Date.parse(events.at(-1)!.receivedAt)));
 assert.equal((await response.json()).reason,'notification_not_supported');
 t.mock.method(console,'warn',()=>{});assert.equal((await bankWebhook(request('{'),env,()=>{throw new Error('logger unavailable');})).status,400);
});
