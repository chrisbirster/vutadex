import type { DatabaseSync } from 'node:sqlite';
import { getDeck } from './decks.ts';
import { generateCards, NoteError, NOTE_FIELDS } from './note-types.ts';
import type { Draft, GeneratedCard, Note, NoteType } from '../models/note.ts';
import { execute, loadQuery, queryAll, queryOne } from '../database/sql.ts';

const GET_NOTE_SQL = loadQuery('notes/get.sql');
const LIST_NOTES_SQL = loadQuery('notes/list.sql');
const GENERATED_CARDS_SQL = loadQuery('notes/generated-cards.sql');
const GENERATED_CARD_KEYS_SQL = loadQuery('notes/generated-card-keys.sql');
const RETIRE_GENERATED_CARDS_SQL = loadQuery('notes/retire-generated-cards.sql');
const REACTIVATE_GENERATED_CARD_SQL = loadQuery('notes/reactivate-generated-card.sql');
const CREATE_GENERATED_CARD_SQL = loadQuery('notes/create-generated-card.sql');
const CREATE_NOTE_SQL = loadQuery('notes/create.sql');
const UPDATE_NOTE_SQL = loadQuery('notes/update.sql');
const RETIRE_NOTE_SQL = loadQuery('notes/retire.sql');
const NOTE_FOR_CARD_SQL = loadQuery('notes/for-card.sql');
const CREATE_CARD_SQL = loadQuery('cards/create.sql');
const UPDATE_CARD_SQL = loadQuery('cards/update.sql');

type NoteRow = { id:number; deck_id:number; note_type:NoteType;
  fields_json:string; tags_json:string; retired:number };
const decode = (row: NoteRow): Note => ({
  id:row.id, deckId:row.deck_id, type:row.note_type,
  fields:JSON.parse(row.fields_json) as string[],
  tags:JSON.parse(row.tags_json) as string[], retired:row.retired!==0
});
function getRow(db: DatabaseSync, id: number): NoteRow {
  const row=queryOne<NoteRow>(db,GET_NOTE_SQL,id);
  if (!row) throw new NoteError('Note '+id+' not found.');
  return row;
}
export function getNote(db:DatabaseSync,id:number):Note {
  const note=decode(getRow(db,id));
  if (note.retired) throw new NoteError('Note '+id+' is retired.');
  return note;
}
export function listNotes(db:DatabaseSync,deckId:number):Note[] {
  getDeck(db,deckId);
  return queryAll<NoteRow>(db,LIST_NOTES_SQL,deckId).map(decode);
}
export function generatedCards(db:DatabaseSync,noteId:number):GeneratedCard[] {
  getRow(db,noteId);
  return queryAll<{cardId:number;key:string;retired:number}>(db,GENERATED_CARDS_SQL,noteId)
    .map(row=>({cardId:row.cardId,key:row.key,retired:row.retired!==0}));
}
function validateFields(type:NoteType,fields:readonly string[]):Draft[] {
  if (!NOTE_FIELDS[type]) throw new NoteError('Invalid note type.');
  // The caller generates again after the note has an allocated stable ID.
  return generateCards(1,type,fields);
}
function updateCards(db:DatabaseSync,noteId:number,deckId:number,drafts:readonly Draft[]):number[] {
  const rows = queryAll<{card_id:number;generation_key:string}>(db,GENERATED_CARD_KEYS_SQL,noteId);
  const existing = new Map(rows.map(row=>[row.generation_key,row.card_id]));
  execute(db,RETIRE_GENERATED_CARDS_SQL,noteId);
  const ids:number[]=[];
  for(const draft of drafts){
    const old=existing.get(draft.key);
    if(old!==undefined){
      execute(db,UPDATE_CARD_SQL,draft.front,draft.back,old);
      execute(db,REACTIVATE_GENERATED_CARD_SQL,old);
      ids.push(old);
    }else{
      const result=execute(db,CREATE_CARD_SQL,deckId,draft.front,draft.back);
      const cardId=Number(result.lastInsertRowid);
      execute(db,CREATE_GENERATED_CARD_SQL,cardId,noteId,draft.key);
      ids.push(cardId);
    }
  }
  return ids;
}
export function createNote(
  db:DatabaseSync,deckId:number,type:NoteType,fields:readonly string[],tags:string[]=[]
):{note:Note;cardIds:number[]} {
  getDeck(db,deckId);
  validateFields(type,fields);
  if (!Array.isArray(tags) || tags.some(t=>typeof t!=='string' || t.length>100))
    throw new NoteError('Invalid note tags.');
  db.exec('BEGIN IMMEDIATE');
  try{
    const result=execute(db,CREATE_NOTE_SQL,deckId,type,JSON.stringify(fields),JSON.stringify(tags));
    const id=Number(result.lastInsertRowid);
    const cards=updateCards(db,id,deckId,generateCards(id,type,fields));
    db.exec('COMMIT');
    return {note:getNote(db,id),cardIds:cards};
  }catch(err){db.exec('ROLLBACK');throw err;}
}
export function updateNote(
  db:DatabaseSync,id:number,fields:readonly string[]
):{note:Note;cardIds:number[]} {
  const current=getNote(db,id);
  validateFields(current.type,fields);
  db.exec('BEGIN IMMEDIATE');
  try{
    const cardIds=updateCards(db,id,current.deckId,generateCards(id,current.type,fields));
    execute(db,UPDATE_NOTE_SQL,JSON.stringify(fields),id);
    db.exec('COMMIT');
    return {note:getNote(db,id),cardIds};
  }catch(err){db.exec('ROLLBACK');throw err;}
}
/** Soft retirement deliberately preserves generated card IDs and review history. */
export function retireNote(db:DatabaseSync,id:number):void {
  getNote(db,id);
  db.exec('BEGIN IMMEDIATE');
  try{
    execute(db,RETIRE_NOTE_SQL,id);
    execute(db,RETIRE_GENERATED_CARDS_SQL,id);
    db.exec('COMMIT');
  }catch(err){db.exec('ROLLBACK');throw err;}
}
export function noteForCard(db:DatabaseSync,cardId:number):
  (Note & {generationKey:string})|null {
  const row=queryOne<NoteRow & {generation_key:string}>(db,NOTE_FOR_CARD_SQL,cardId);
  return row ? {...decode(row),generationKey:row.generation_key} : null;
}
