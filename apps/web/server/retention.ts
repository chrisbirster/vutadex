export type RatedEvent={
  rating:number;created_at:number;undone_at:number|null;
  review_count_before:number|null;last_review_at_before:number|null;due_at_before:number|null;
  deck:string;
};
export type RetentionResult={eligible:number;recalled:number;observedPercent:number|null;byDeck:{deck:string;eligible:number;recalled:number;observedPercent:number}[]};
export const MIN_MATURE_ELAPSED_MS=24*60*60*1000;
/**
 * Eligible: previously scheduled card, review occurred on/after due, at least
 * 24 hours since its previous review. Excludes initial learning, immediate
 * Again retries and undone reviews. A self-rating of 2–4 counts as recalled.
 * Never call this metric FSRS target retention or typed-answer accuracy.
 */
export function matureRetention(events:readonly RatedEvent[]):RetentionResult{
  let eligible=0,recalled=0;
  const decks=new Map<string,{eligible:number;recalled:number}>();
  for(const event of events){
    if(event.undone_at!==null||event.review_count_before===null||event.review_count_before<1||
      event.last_review_at_before===null||event.due_at_before===null||event.due_at_before>event.created_at||
      event.created_at-event.last_review_at_before<MIN_MATURE_ELAPSED_MS||![1,2,3,4].includes(event.rating))continue;
    eligible++;
    const success=event.rating!==1?1:0;
    recalled+=success;
    const bucket=decks.get(event.deck)||{eligible:0,recalled:0};
    bucket.eligible++;bucket.recalled+=success;decks.set(event.deck,bucket);
  }
  const percent=(yes:number,total:number)=>total?Math.round(yes/total*1000)/10:null;
  return {eligible,recalled,observedPercent:percent(recalled,eligible),
    byDeck:[...decks].sort(([a],[b])=>a.localeCompare(b)).map(([deck,v])=>({
      deck,eligible:v.eligible,recalled:v.recalled,observedPercent:percent(v.recalled,v.eligible)!
    }))};
}
