import type { DatabaseSync } from 'node:sqlite';
import { getDeck } from './decks.ts';
import { generateCards, NoteError, NOTE_FIELDS } from './note-types.ts';
import type { NoteType, Draft } from './note-types.ts';

export interface Note {
  id: number; deckId: number; type: NoteType;
  fields: string[]; tags: string[]; retired: boolean;
}
export interface GeneratedCard {
  cardId: number; key: string; retired: boolean;
}
type NoteRow = { id:number; deck_id:number; note_type:NoteType;
  fields_json:string; tags_json:string; retired:number };
const decode = (row: NoteRow): Note => ({
  id:row.id, deckId:row.deck_id, type:row.note_type,
  fields:JSON.parse(row.fields_json) as string[],
  tags:JSON.parse(row.tags_json) as string[], retired:row.retired!==0
});
function getRow(db: DatabaseSync, id: number): NoteRow {
  const row=db.prepare('SELECT * FROM notes WHERE id=?').get(id) as NoteRow|undefined;
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
  return (db.prepare('SELECT * FROM notes WHERE deck_id=? AND retired=0 ORDER BY id')
    .all(deckId) as unknown as NoteRow[]).map(decode);
}
export function generatedCards(db:DatabaseSync,noteId:number):GeneratedCard[] {
  getRow(db,noteId);
  return (db.prepare('SELECT card_id AS cardId, generation_key AS key, retired FROM generated_cards WHERE note_id=? ORDER BY generation_key')
    .all(noteId) as unknown as Array<{cardId:number;key:string;retired:number}>)
    .map(row=>({cardId:row.cardId,key:row.key,retired:row.retired!==0}));
}
function validateFields(type:NoteType,fields:readonly string[]):Draft[] {
  if (!NOTE_FIELDS[type]) throw new NoteError('Invalid note type.');
  // The caller generates again after the note has an allocated stable ID.
  return generateCards(1,type,fields);
}
function updateCards(db:DatabaseSync,noteId:number,deckId:number,drafts:readonly Draft[]):number[] {
  const rows = db.prepare('SELECT card_id, generation_key FROM generated_cards WHERE note_id=?')
    .all(noteId) as unknown as Array<{card_id:number;generation_key:string}>;
  const existing = new Map(rows.map(row=>[row.generation_key,row.card_id]));
  db.prepare('UPDATE generated_cards SET retired=1 WHERE note_id=?').run(noteId);
  const ids:number[]=[];
  for(const draft of drafts){
    const old=existing.get(draft.key);
    if(old!==undefined){
      db.prepare('UPDATE cards SET front=?, back=? WHERE id=?').run(draft.front,draft.back,old);
      db.prepare('UPDATE generated_cards SET retired=0 WHERE card_id=?').run(old);
      ids.push(old);
    }else{
      const result=db.prepare('INSERT INTO cards(deck_id,front,back) VALUES (?,?,?)')
        .run(deckId,draft.front,draft.back);
      const cardId=Number(result.lastInsertRowid);
      db.prepare('INSERT INTO generated_cards(card_id,note_id,generation_key) VALUES (?,?,?)')
        .run(cardId,noteId,draft.key);
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
    const result=db.prepare('INSERT INTO notes(deck_id,note_type,fields_json,tags_json) VALUES (?,?,?,?)')
      .run(deckId,type,JSON.stringify(fields),JSON.stringify(tags));
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
    db.prepare('UPDATE notes SET fields_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(JSON.stringify(fields),id);
    db.exec('COMMIT');
    return {note:getNote(db,id),cardIds};
  }catch(err){db.exec('ROLLBACK');throw err;}
}
/** Soft retirement deliberately preserves generated card IDs and review history. */
export function retireNote(db:DatabaseSync,id:number):void {
  getNote(db,id);
  db.exec('BEGIN IMMEDIATE');
  try{
    db.prepare('UPDATE notes SET retired=1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
    db.prepare('UPDATE generated_cards SET retired=1 WHERE note_id=?').run(id);
    db.exec('COMMIT');
  }catch(err){db.exec('ROLLBACK');throw err;}
}
export function noteForCard(db:DatabaseSync,cardId:number):
  (Note & {generationKey:string})|null {
  const row=db.prepare(`
    SELECT n.*,g.generation_key FROM notes n
    JOIN generated_cards g ON g.note_id=n.id
    WHERE g.card_id=? AND g.retired=0 AND n.retired=0
  `).get(cardId) as (NoteRow & {generation_key:string})|undefined;
  return row ? {...decode(row),generationKey:row.generation_key} : null;
}
