export const PRIMARY_ADMIN_UID='PRIMARY_ADMIN_UID_HERE';
export function validUserId(uid:string){return /^[A-Za-z0-9_-]{1,128}$/.test(uid);}
export type ManagedUser={uid:string;displayName:string;preferredName:string;email:string;provider:'anonymous'|'google.com'|'unknown';createdAt:string;lastSeenAt:string;admin:boolean;blocked:boolean;orderCount:number;lastOrderDate:string;aliases:string[]};
export type UserDirectory={users:ManagedUser[];canManageRoles:boolean};
