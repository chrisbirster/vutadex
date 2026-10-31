import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHistory,stableId} from '../server/history.ts';
import {FSRS_VERSION} from '../../../fsrs/parameters.ts';
const base=()=>({
  format:'vutadex.full-history',version:1,sourceId:'local_cli_01',schedulerVersion:FSRS_VERSION,
  decks:[{id:1,name:'Study',description:null}],
  notes:[{id:10,deckId:1,type:'basic',fields:['Q','A'],tags:[]}],
  cards:[{id:40,deckId:1,noteId:10,key:'note:10:template:0',front:'Q',back:'A'}],
  schedules:[{cardId:40,stability:5,difficulty:3,fastStability:2,lastReviewAt:'2026-10-29T12:00:00Z',dueAt:'2026-11-01T12:00:00Z',reviewCount:1,schedulerVersion:FSRS_VERSION}],
  events:[{id:70,cardId:40,eventType:'review',rating:3,occurredAt:'2026-10-29T12:00:00Z',undoneReviewId:null,raw:{id:70,rating:3}}]
});
test('history schema validates references, scheduler compatibility and stable owner mapping',()=>{
  const valid=parseHistory(base());
  assert.equal(valid.summary.reviews,1);
  assert.equal(valid.summary.schedules,1);
  assert.notEqual(stableId('owner-a','local_cli_01','card',40),stableId('owner-b','local_cli_01','card',40));
  assert.throws(()=>parseHistory({...base(),schedulerVersion:'not-fsrs-7'}),/Scheduler conversion/);
  assert.throws(()=>parseHistory({...base(),cards:[{...base().cards[0],deckId:99}]}),/Orphan card/);
});
test('history rejects missing linked undo or media without ownership',()=>{
  const invalid={...base(),events:[{id:71,cardId:40,eventType:'undo',rating:null,occurredAt:'2026-10-30T12:00:00Z',undoneReviewId:999,raw:{}}]};
  assert.throws(()=>parseHistory(invalid),/Invalid linked undo/);
  const missing={...base(),notes:[{id:10,deckId:1,type:'image-occlusion',fields:['deez-media://sha256:'+'a'.repeat(64),'[]',''],tags:[]}]};
  assert.throws(()=>parseHistory(missing),/portable owned media/);
});
