export type BankAccount={bankBin:string;bankName:string;accountNumber:string;accountName:string};
export type PaymentIntent=BankAccount&{reference:string;dayId:string;orderId:string;ownerId:string;name:string;amount:number;dishId:string;price:number;quantity:number;description:string;expiresAt:string};
export const paymentReferencePattern=/\bCOM[A-F0-9]{20}\b/g;
export function normalizeBankAccount(value:BankAccount):BankAccount{
 const account={bankBin:value.bankBin.trim(),bankName:value.bankName.normalize('NFC').trim(),accountNumber:value.accountNumber.replace(/\s/g,''),accountName:value.accountName.normalize('NFC').trim()};
 if(!/^\d{6}$/.test(account.bankBin)||!account.bankName||account.bankName.length>100||!/^[A-Za-z0-9]{1,34}$/.test(account.accountNumber)||!account.accountName||account.accountName.length>70)throw new Error('Kiểm tra ngân hàng, số tài khoản (1–34 chữ/số) và tên người nhận (tối đa 70 ký tự).');
 return account;
}
export function isBankAccount(value:unknown):value is BankAccount{
 if(!value||typeof value!=='object')return false;const v=value as BankAccount;
 return ['bankBin','bankName','accountNumber','accountName'].every(k=>typeof v[k as keyof BankAccount]==='string')&&/^\d{6}$/.test(v.bankBin)&&/^[A-Za-z0-9]{1,34}$/.test(v.accountNumber)&&!!v.accountName&&!!v.bankName;
}
export function newPaymentReference(){return 'COM'+Array.from(crypto.getRandomValues(new Uint8Array(10)),b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();}
export function paymentDescription(reference:string){
 if(!/^COM[A-F0-9]{20}$/.test(reference))throw new Error('Mã thanh toán chưa hợp lệ.');
 // NAPAS purpose/addInfo is at most 25 characters. Keep the whole unique
 // reference here; display the person's name and meal date alongside the QR.
 return reference;
}
function tlv(id:string,value:string){if(value.length>99||/[^\x20-\x7e]/.test(value))throw new Error('Dữ liệu QR chưa hợp lệ.');return id+String(value.length).padStart(2,'0')+value;}
export function crc16(value:string){let crc=0xffff;for(const byte of new TextEncoder().encode(value)){crc^=byte<<8;for(let i=0;i<8;i++)crc=((crc&0x8000)?(crc<<1)^0x1021:crc<<1)&0xffff;}return crc.toString(16).toUpperCase().padStart(4,'0');}
export function vietQrPayload(account:BankAccount,amount?:number,description=''){
 normalizeBankAccount(account);
 if(amount!==undefined&&(!Number.isSafeInteger(amount)||amount<1000||amount>30000000))throw new Error('Số tiền QR chưa hợp lệ.');
 if(description.length>25)throw new Error('Nội dung QR tối đa 25 ký tự.');
 const beneficiary=tlv('00',account.bankBin)+tlv('01',account.accountNumber);
 const merchant=tlv('00','A000000727')+tlv('01',beneficiary)+tlv('02','QRIBFTTA');
 const name=account.accountName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'D').toUpperCase().replace(/[^A-Z0-9 ]/g,'').slice(0,25);
 const payload=tlv('00','01')+tlv('01',amount===undefined?'11':'12')+tlv('38',merchant)+tlv('53','704')+(amount===undefined?'':tlv('54',String(amount)))+tlv('58','VN')+(name?tlv('59',name):'')+(description?tlv('62',tlv('08',description)):'')+'6304';
 return payload+crc16(payload);
}
