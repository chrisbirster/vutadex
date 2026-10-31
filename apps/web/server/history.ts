import {createHash} from 'node:crypto';
import {FSRS_VERSION} from '../../../fsrs/parameters.ts';
import {validateNote,generateVariants,type NotePayload} from './content.ts';

export class MigrationError extends Error {}
export type SourceDeck={id:number;name:string;description:string|null};
export type SourceNote={id:number;deckId:number;type:string;fields:string[];tags:string[]};
export type SourceCard={id:number;deckId:number;noteId:number|null;key:string|null;front:string;back:string};
export type SourceSchedule={cardId:number;stability:number;difficulty:number;fastStability:number;lastReviewAt:string;dueAt:string;reviewCount:number;schedulerVersion:string};
export type SourceEvent={id:number;cardId:number;eventType:'review'|'undo';rating:number|null;occurredAt:string;undoneReviewId:number|null;raw:Record<string,unknown>};
export type HistoryBundle={format:'vutadex.full-history';version:1;sourceId:string;schedulerVersion:string;decks:SourceDeck[];notes:SourceNote[];cards:SourceCard[];schedules:SourceSchedule[];events:SourceEvent[]};
export type ValidatedHistory={bundle:HistoryBundle;checksum:string;notes:Map<number,NotePayload>;summary:{decks:number;notes:number;cards:number;schedules:number;reviews:number;undos:number};};
const id=(v:unknown,label:string)=>{if(!Number.isSafeInteger(v)||Number(v)<1)throw new MigrationError('Invalid '+label);return Number(v);};
const nonempty=(s:unknown,label:string,limit=6000)=>{if(typeof s!=='string'||!s.trim()||s.length>limit||s.includes('\0'))throw new MigrationError('Invalid '+label);return s;};
const integerMap=<T>(rows:T[],key:(v:T)=>number,label:string):Map<number,T>=>{
  const map=new Map<number,T>();for(const row of rows){const value=key(row);if(map.has(value))throw new MigrationError('Duplicate '+label);map.set(value,row);}return map;
};
export function stableId(owner:string,source:string,kind:string,sourceId:number):string{
  const hex=createHash('sha256').update(owner+'\0'+source+'\0'+kind+'\0'+sourceId).digest('hex');
  return [hex.slice(0,8),hex.slice(8,12),'4'+hex.slice(13,16),'8'+hex.slice(17,20),hex.slice(20,32)].join('-');
}
export function parseHistory(input:unknown):ValidatedHistory{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new MigrationError('Invalid bundle');
  const b=input as HistoryBundle;
  if(b.format!=='vutadex.full-history'||b.version!==1)throw new MigrationError('Unknown migration format');
  if(!/^[a-zA-Z0-9_-]{4,64}$/.test(b.sourceId||''))throw new MigrationError('Explicit stable sourceId required');
  if(b.schedulerVersion!==FSRS_VERSION)throw new MigrationError('Scheduler conversion needs review before import');
  if(![b.decks,b.notes,b.cards,b.schedules,b.events].every(Array.isArray))throw new MigrationError('Missing migration arrays');
  if(b.decks.length>1000||b.notes.length>15000||b.cards.length>30000||b.schedules.length>30000||b.events.length>50000)
    throw new MigrationError('History exceeds single-transaction import limits');
  const decks=integerMap(b.decks,d=>id(d.id,'deck id'),'deck id');
  const notes=integerMap(b.notes,n=>id(n.id,'note id'),'note id');
  const cards=integerMap(b.cards,c=>id(c.id,'card id'),'card id');
  const schedules=integerMap(b.schedules,c=>id(c.cardId,'schedule card id'),'schedule card id');
  const events=integerMap(b.events,e=>id(e.id,'event id'),'event id');
  const normalized=new Map<number,NotePayload>();
  for(const d of b.decks){nonempty(d.name,'deck name',120);if(d.description!==null&&typeof d.description!=='string')throw new MigrationError('Invalid deck description');}
  for(const n of b.notes){
    if(n.type==='image-occlusion')throw new MigrationError('Image occlusion history requires portable owned media before migration');
    if(!decks.has(id(n.deckId,'note deck')))throw new MigrationError('Orphan note');
    if(!Array.isArray(n.tags)||n.tags.some(t=>typeof t!=='string'||t.length>100))throw new MigrationError('Invalid tags');
    try{normalized.set(n.id,validateNote({type:n.type,fields:n.fields,tags:n.tags.join(',')}));}
    catch(e){throw new MigrationError('Unsupported legacy note '+n.id+': '+String(e));}
  }
  for(const c of b.cards){
    if(!decks.has(id(c.deckId,'card deck')))throw new MigrationError('Orphan card');
    if(c.noteId!==null && (!notes.has(id(c.noteId,'card note'))||notes.get(c.noteId)!.deckId!==c.deckId))throw new MigrationError('Orphan/mismatched card note');
    nonempty(c.front,'card front');nonempty(c.back,'card back');
    if(c.key!==null && (typeof c.key!=='string'||c.key.length>140))throw new MigrationError('Invalid card variant key');
  }
  for(const row of b.schedules){
    if(!cards.has(row.cardId))throw new MigrationError('Orphan schedule');
    if(row.schedulerVersion!==FSRS_VERSION)throw new MigrationError('Unsupported scheduled card version');
    if([row.stability,row.difficulty,row.fastStability].some(v=>!Number.isFinite(v)||v<0)||
      !Number.isSafeInteger(row.reviewCount)||row.reviewCount<1)throw new MigrationError('Invalid scheduler memory state');
    parseDate(row.lastReviewAt);parseDate(row.dueAt);
  }
  for(const event of b.events){
    if(!cards.has(id(event.cardId,'review card id')))throw new MigrationError('Orphan review');
    parseDate(event.occurredAt);
    if(event.eventType==='review'){
      if(![1,2,3,4].includes(event.rating||0)||event.undoneReviewId!==null)throw new MigrationError('Invalid review event');
    }else if(event.eventType==='undo'){
      if(event.rating!==null||!event.undoneReviewId||!events.has(event.undoneReviewId)||
        events.get(event.undoneReviewId)?.eventType!=='review'||events.get(event.undoneReviewId)?.cardId!==event.cardId)
        throw new MigrationError('Invalid linked undo');
    }else throw new MigrationError('Invalid event type');
    if(!event.raw||typeof event.raw!=='object'||Array.isArray(event.raw))throw new MigrationError('Missing event provenance');
  }
  // Reject a source claiming the same review was undone twice.
  const undoIds=b.events.filter(e=>e.eventType==='undo').map(e=>e.undoneReviewId);
  if(new Set(undoIds).size!==undoIds.length)throw new MigrationError('Duplicate undo');
  return {bundle:b,checksum:createHash('sha256').update(JSON.stringify(b)).digest('hex'),notes:normalized,
    summary:{decks:decks.size,notes:notes.size,cards:cards.size,schedules:schedules.size,
      reviews:b.events.filter(e=>e.eventType==='review').length,undos:b.events.filter(e=>e.eventType==='undo').length}};
}
export function parseDate(value:unknown):number{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value))throw new MigrationError('Expected ISO timestamp');
  const n=Date.parse(value);if(!Number.isFinite(n))throw new MigrationError('Invalid timestamp');
  return n;
}
