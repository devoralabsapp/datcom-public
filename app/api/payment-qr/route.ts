export const dynamic='force-dynamic';
export async function GET(){
 // Retire the old local-file URL, including the beforeFiles rewrite.
 // New payment information is read through authenticated Firestore Rules.
 return new Response('Thông tin thanh toán đã chuyển sang Firebase.',{status:410,headers:{'Cache-Control':'no-store'}});
}
