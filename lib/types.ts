export type MenuItem={name:string;price:number};
export type Order={id:string;dayId:string;name:string;dish:string;price:number;quantity:number;paid:boolean;note:string;actor:string;cancelled:boolean;updatedAt:string;receivedAmount?:number;refundedAmount?:number;voidedAmount?:number;canEdit?:boolean};
export type Day={id:string;date:string;label:string;menu:MenuItem[];source:boolean;status:string;menuCount?:number};
export type Workspace={days:Day[];day:Day;orders:Order[];cancelledOrders?:Order[];members:string[];admin:boolean;userId:string;locked:boolean;blocked?:boolean;importedAt:string;sourceCount:number;sourceUrl:string;paymentAvailable:boolean;paymentUrl?:string;demo:boolean;signedIn:boolean;displayName:string;storageReady:boolean};
