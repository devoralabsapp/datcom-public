import {resumeGroupPayment} from '../../../../../../lib/payment-webhook';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function POST(request:Request,{params}:{params:Promise<{reference:string}>}){return resumeGroupPayment(request,(await params).reference);}
