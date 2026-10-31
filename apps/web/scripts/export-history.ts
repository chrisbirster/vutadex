import {DatabaseSync} from 'node:sqlite';
import {openSync,writeFileSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {FSRS_VERSION} from '../../../fsrs/parameters.ts';
import {parseHistory,type HistoryBundle, type SourceEvent} from '../server/history.ts';
function all<T>(db:DatabaseSync,sql:string):T[]{return db.prepare(sql).all() as T[];}
/** Builds a complete bounded snapshot without writing to the source CLI database. */
export function exportLegacyHistory(path:string,sourceId:string):HistoryBundle{
  const db=new DatabaseSync(resolve(path),{readOnly:true});
  try{
    db.exec('PRAGMA query_only=ON');
    const version=Number((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version);
    if(version!==5)throw new Error('History export supports CLI schema v5 only; migrate a disposable copy first.');
    const decks=all<{id:number;name:string;description:string|null}>(db,'SELECT id,name,description FROM decks ORDER BY id');
    const notes=all<{id:number;deck_id:number;note_type:string;fields_json:string;tags_json:string}>(db,'SELECT id,deck_id,note_type,fields_json,tags_json FROM notes WHERE retired=0 ORDER BY id')
      .map(n=>({id:n.id,deckId:n.deck_id,type:n.note_type,fields:JSON.parse(n.fields_json) as string[],tags:JSON.parse(n.tags_json) as string[]}));
    const cards=all<{id:number;deck_id:number;front:string;back:string;note_id:number|null;generation_key:string|null}>(db,
      'SELECT c.id,c.deck_id,c.front,c.back,g.note_id,g.generation_key FROM cards c LEFT JOIN generated_cards g ON g.card_id=c.id WHERE g.retired=0 OR g.card_id IS NULL ORDER BY c.id')
      .map(c=>({id:c.id,deckId:c.deck_id,front:c.front,back:c.back,noteId:c.note_id,key:c.generation_key}));
    const validCardIds=new Set(cards.map(c=>c.id));
    const schedules=all<{card_id:number;stability:number;difficulty:number;fast_stability:number;last_review_at:string;due_at:string;review_count:number;scheduler_version:string}>(db,
      'SELECT card_id,stability,difficulty,fast_stability,last_review_at,due_at,review_count,scheduler_version FROM card_schedules ORDER BY card_id')
      .filter(c=>validCardIds.has(c.card_id))
      .map(c=>({cardId:c.card_id,stability:c.stability,difficulty:c.difficulty,fastStability:c.fast_stability,
        lastReviewAt:c.last_review_at,dueAt:c.due_at,reviewCount:c.review_count,schedulerVersion:c.scheduler_version}));
    const rawEvents=all<Record<string,unknown>>(db,'SELECT * FROM review_events ORDER BY id');
    const events:SourceEvent[]=rawEvents.filter(e=>validCardIds.has(Number(e.card_id))).map(e=>({
      id:Number(e.id),cardId:Number(e.card_id),eventType:e.event_type as SourceEvent['eventType'],
      rating:e.rating===null?null:Number(e.rating),occurredAt:String(e.occurred_at),
      undoneReviewId:e.undone_review_id===null?null:Number(e.undone_review_id),raw:e
    }));
    const bundle:HistoryBundle={format:'vutadex.full-history',version:1,sourceId,schedulerVersion:FSRS_VERSION,decks,notes,cards,schedules,events};
    parseHistory(bundle);
    return bundle;
  }finally{db.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){
  const path=process.argv[2],sourceId=process.argv[3],out=process.argv[4];
  if(!path||!sourceId||!out){console.error('Usage: node --experimental-strip-types scripts/export-history.ts /path/to/vutadex.db stable-source-id /private/path/export.json');process.exitCode=2;}
  else{
    try{
      const bundle=exportLegacyHistory(path,sourceId);
      const data=JSON.stringify(bundle);
      if(Buffer.byteLength(data)>3_500_000)throw new Error('Snapshot exceeds 3.5 MiB; chunked migration requires a separate owner-approved workflow.');
      const file=openSync(resolve(out),'wx',0o600);
      try{writeFileSync(file,data+'\n');}finally{closeSync(file);}
      console.log('Created private migration bundle with '+bundle.decks.length+' decks and '+bundle.events.length+' original review/undo events.');
    }catch(e){console.error(e instanceof Error?e.message:'History export failed');process.exitCode=1;}
  }
}
