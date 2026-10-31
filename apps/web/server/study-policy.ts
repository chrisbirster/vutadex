import {nextIntervalDays,nextMemoryState,type MemoryState,type Rating} from '../../../fsrs/algorithm.ts';

const formatter = (timezone:string) => new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});
function dateParts(instant:number,timezone:string):string{
  const parts=formatter(timezone).formatToParts(new Date(instant));
  const field=(type:string)=>parts.find(p=>p.type===type)!.value;
  return field('year')+'-'+field('month')+'-'+field('day');
}
export function validTimezone(zone:string):boolean{
  try{formatter(zone).format(new Date());return true;}catch{return false;}
}
/** Binary search for account-local midnight. Handles 23/25-hour DST days without fixed offsets. */
export function localDayStart(instant:number,timezone:string):number{
  if(!validTimezone(timezone))throw new RangeError('Invalid account timezone');
  const today=dateParts(instant,timezone);
  let left=instant-48*3600000,right=instant;
  for(let i=0;i<49;i++){
    const middle=Math.floor((left+right)/2);
    if(dateParts(middle,timezone)<today)left=middle+1;
    else right=middle;
  }
  return right;
}
export function intervalForRating(state:MemoryState|null,lastReviewAt:number|null,rating:Rating,instant:number){
  const elapsed=lastReviewAt===null?0:Math.max(0,(instant-lastReviewAt)/86400000);
  const next=nextMemoryState(state,elapsed,rating);
  const interval=rating===1?60000:Math.max(60000,Math.round(nextIntervalDays(next)*86400000));
  return {state:next,intervalMs:interval,dueAt:instant+interval};
}
export function intervalPreviews(state:MemoryState|null,lastReviewAt:number|null,instant:number){
  return [1,2,3,4].map(rating=>({rating:rating as Rating,...intervalForRating(state,lastReviewAt,rating as Rating,instant)}))
    .map(({rating,intervalMs,dueAt})=>({rating,intervalMs,dueAt}));
}
export function pickReadyIndex(queue:readonly string[],position:number,due:ReadonlyMap<string,number>,instant:number):number{
  for(let i=position;i<queue.length;i++)if((due.get(queue[i]!)??Infinity)<=instant)return i;
  return -1;
}
