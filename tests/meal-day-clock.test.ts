import test from 'node:test';
import assert from 'node:assert/strict';
import {nextMealMidnight,watchMealDate} from '../lib/meal-day-clock';

test('meal clock rolls at Vietnam midnight and catches up after a suspended tab',()=>{
 let time=new Date('2026-12-31T23:59:59.500+07:00').getTime(),callback:(()=>void)|undefined,delay=0;
 const dates:string[]=[],clock=watchMealDate(date=>dates.push(date),{now:()=>new Date(time),setTimer(fn,ms){callback=fn;delay=ms;return fn;},clearTimer(){callback=undefined;}});
 assert.deepEqual(dates,['2026-12-31']);assert.equal(delay,500);
 time+=500;callback!();assert.deepEqual(dates,['2026-12-31','2027-01-01']);assert.equal(delay,86400000);
 clock.check();assert.equal(dates.length,2);
 time=new Date('2027-01-04T08:00:00+07:00').getTime();clock.check();assert.equal(dates.at(-1),'2027-01-04');assert.equal(delay,16*3600000);
 assert.equal(nextMealMidnight(new Date(time)),new Date('2027-01-05T00:00:00+07:00').getTime());
 clock.stop();assert.equal(callback,undefined);time+=86400000;clock.check();assert.equal(dates.length,3);
});
