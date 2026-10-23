import test from 'node:test';
import assert from 'node:assert/strict';
import {crc16,newPaymentReference,normalizeBankAccount,paymentDescription,vietQrPayload} from '../lib/payment-model';
import {parseBankNotification} from '../lib/bank-notification';
import {bankWebhook} from '../lib/payment-webhook';

const reference='COM'+('A'.repeat(20));
const account={bankBin:'970418',bankName:'BIDV',accountNumber:'000123456789',accountName:'NGUYEN VAN MAU'};
const notification=`BIDV notice to customer
Transaction Time: 09:41 23/10/2026
Account thanh toán: 000123456789
Transaction Amount: +40,000 VND
Ending Balance: 9,999,999 VND
Transaction Details: Nguyen Van Mau 23/10 ${reference}
Transaction Code: FAKE-TRANSACTION-001`;

test('VietQR encodes the exact beneficiary, integer amount and unique order reference with CRC16',()=>{
 assert.equal(crc16('123456789'),'29B1');
 const description=paymentDescription('  Đặng Thị Người Mẫu rất dài  ','2026-10-23',reference);
 assert.ok(description.length<=50);assert.ok(description.includes('23/10 '+reference));assert.ok(!/[^\x20-\x7e]/.test(description));
 const payload=vietQrPayload(account,40000,description);
 const fields=new Map<string,string>();let cursor=0;while(cursor<payload.length){const id=payload.slice(cursor,cursor+2),length=Number(payload.slice(cursor+2,cursor+4));fields.set(id,payload.slice(cursor+4,cursor+4+length));cursor+=4+length;}
 assert.equal(cursor,payload.length);assert.equal(fields.get('54'),'40000');assert.equal(fields.get('53'),'704');assert.equal(fields.get('58'),'VN');assert.ok(fields.get('38')?.includes(account.accountNumber));assert.ok(fields.get('38')?.includes('970418'));assert.ok(fields.get('62')?.includes(reference));assert.equal(fields.get('63'),crc16(payload.slice(0,-4)));
 assert.notEqual(newPaymentReference(),newPaymentReference());assert.match(newPaymentReference(),/^COM[A-F0-9]{20}$/);
 for(const amount of [1,40000.5,-40000,Infinity,30000001])assert.throws(()=>vietQrPayload(account,amount,description));
 assert.throws(()=>normalizeBankAccount({...account,accountNumber:'../account'}));assert.throws(()=>normalizeBankAccount({...account,bankBin:'BIDV'}));
});

test('BIDV parser uses credit amount rather than balance and finds the reference throughout raw notifications',()=>{
 const parsed=parseBankNotification(notification);assert.equal(parsed.amount,40000);assert.equal(parsed.accountNumber,account.accountNumber);assert.equal(parsed.transactionId,'FAKE-TRANSACTION-001');assert.equal(parsed.bankBin,'970418');assert.equal(parsed.reference,reference);assert.equal(parsed.occurredAt,'2026-10-23T02:41:00.000Z');
 assert.equal(parseBankNotification(notification.replace(/\n/g,' ')).amount,40000);
 assert.equal(parseBankNotification(notification.replace('Transaction Details','Nội dung')).reference,reference);
 assert.equal(parseBankNotification(notification.replace('Transaction Details','Nội dung').replace('Ending Balance: 9,999,999 VND\n','').replace(/\n/g,' ')).amount,40000);
 assert.equal(parseBankNotification(notification.replace('Transaction Amount','Số tiền').replace('40,000','40.000')).amount,40000);
 assert.equal(parseBankNotification(notification.replace(reference,'Khong co ma')+'\nNoi dung: '+reference).reference,reference);
 for(const invalid of [notification.replace('+40,000','-40,000'),notification.replace('+40,000','40,000'),notification.replace('40,000 VND','40,000 USD'),notification.replace('Transaction Amount: +40,000 VND',''),notification+'\nTransaction Amount: +50,000 VND',notification+' COM'+('B'.repeat(20)),notification.replace('000123456789','***6789'),notification.replace('23/10/2026','31/02/2026'),notification.replace('FAKE-TRANSACTION-001',''),notification.replace(reference,'khong-co-ma')])assert.throws(()=>parseBankNotification(invalid));
});

test('bank webhook rejects unauthorized, oversized and malformed requests before touching Firebase',async()=>{
 const secret='s'.repeat(64),env={PAYMENT_WEBHOOK_SECRET:secret};
 const request=(body:string,authorization='Bearer '+secret,type='application/json')=>new Request('http://localhost/api/payments/bank-notification',{method:'POST',headers:{Authorization:authorization,'Content-Type':type},body});
 assert.equal((await bankWebhook(request('{}'),{})).status,503);
 assert.equal((await bankWebhook(request('{}',''),env)).status,401);
 assert.equal((await bankWebhook(request('{}','Bearer '+'x'.repeat(64)),env)).status,401);
 assert.equal((await bankWebhook(request('{}',undefined,'text/html'),env)).status,415);
 for(const body of ['{','null','[]','{}','{"notification":42}','{"notification":"x","amount":40000}'])assert.equal((await bankWebhook(request(body),env)).status,400);
 assert.equal((await bankWebhook(request('x'.repeat(16001),undefined,'text/plain'),env)).status,413);
 const result=await bankWebhook(request(JSON.stringify({notification})),env);assert.equal(result.status,503);assert.ok(!(await result.text()).includes(secret));
});
