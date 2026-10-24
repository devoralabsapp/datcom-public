import {exportBackupApi} from '../../../../lib/personal-backup-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function POST(request:Request){return exportBackupApi(request);}
