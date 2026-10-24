import {verifyBackupApi} from '../../../../lib/personal-backup-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){return verifyBackupApi(request);}
