import {localNow} from './meal-client-model';

export function nextMealMidnight(now=new Date()){
 return new Date(localNow(now).date+'T00:00:00+07:00').getTime()+86400000;
}
type Clock={now:()=>Date;setTimer:(fn:()=>void,ms:number)=>unknown;clearTimer:(id:unknown)=>void};
export function watchMealDate(onDate:(date:string)=>void,clock:Clock={now:()=>new Date(),setTimer:(fn,ms)=>setTimeout(fn,ms),clearTimer:id=>clearTimeout(id as ReturnType<typeof setTimeout>)}){
 let timer:unknown,stopped=false,last='';
 function check(){
  if(stopped)return;clock.clearTimer(timer);const now=clock.now(),date=localNow(now).date;
  if(date!==last){last=date;onDate(date);}
  timer=clock.setTimer(check,Math.max(1,nextMealMidnight(now)-now.getTime()));
 }
 check();return {check,stop(){stopped=true;clock.clearTimer(timer);}};
}
