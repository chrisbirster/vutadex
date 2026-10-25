import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/migrate.ts';
import { createDeck } from '../services/decks.ts';
import { createCard } from '../services/cards.ts';
import { getSchedule,reviewCard,reviewHistory } from '../services/reviews.ts';
import { createNote,updateNote,getNote,listNotes,generatedCards,retireNote } from '../services/notes.ts';
import { generateCards,parseNoteType } from '../services/note-types.ts';

function setup(){
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  migrate(db);
  const deckId=createDeck(db,'Science').id;
  return {db,deckId};
}
test('v3 data migrates to v4 intact, repeatedly, with legacy cards',()=>{
  const {db,deckId}=setup();
  try{
    const cardId=createCard(db,deckId,'Legacy','Answer').id;
    const reviewed=reviewCard(db,cardId,3,new Date('2026-01-01T00:00:00Z'));
    db.exec('DROP TABLE generated_cards; DROP TABLE notes; PRAGMA user_version=3');
    migrate(db);migrate(db);
    assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,5);
    assert.deepEqual(getSchedule(db,cardId),reviewed);
    assert.equal(reviewHistory(db,cardId).length,1);
    assert.deepEqual(listNotes(db,deckId),[]);
  }finally{db.close();}
});
test('basic, reverse, optional reverse and cloze stable generation',()=>{
 const {db,deckId}=setup();
 try {
   const basic=createNote(db,deckId,'basic',['France','Paris']);
   assert.equal(basic.cardIds.length,1);
   const reverse=createNote(db,deckId,'reverse',['France','Paris']);
   assert.equal(reverse.cardIds.length,2);
   assert.deepEqual(generatedCards(db,reverse.note.id).map(c=>c.key),
     ['note:'+reverse.note.id+':template:0','note:'+reverse.note.id+':template:1']);
   const optional=createNote(db,deckId,'optional-reverse',['Spain','Madrid','']);
   assert.equal(optional.cardIds.length,1);
   const added=updateNote(db,optional.note.id,['Spain','Madrid','yes']);
   assert.equal(added.cardIds.length,2);
   const removed=updateNote(db,optional.note.id,['Spain','Madrid','']);
   assert.deepEqual(removed.cardIds,[added.cardIds[0]]);
   const restored=updateNote(db,optional.note.id,['Spain','Madrid','again']);
   assert.deepEqual(restored.cardIds,added.cardIds);
   const c=createNote(db,deckId,'cloze',['{{c1::Paris}} is in {{c2::France}}; {{c1::Paris}} is famous','']);
   assert.equal(c.cardIds.length,2);
   assert.equal(generatedCards(db,c.note.id).length,2);
   const first=db.prepare('SELECT front FROM cards WHERE id=?').get(c.cardIds[0]) as {front:string};
   assert.match(first.front,/\[\.\.\.\] is in France/);
   assert.equal(parseNoteType('basic-reverse'),'reverse');
   assert.throws(()=>createNote(db,deckId,'cloze',['No cloze','']),/Cloze/);
   assert.throws(()=>createNote(db,deckId,'cloze',['{{c0::bad}}','']),/Cloze/);
 }finally{db.close();}
});
test('editing a note retains FSRS schedule and retired cards remain stored',()=>{
 const {db,deckId}=setup();
 try {
   const note=createNote(db,deckId,'reverse',['Alpha','Beta']);
   const [a,b]=note.cardIds;
   const before=reviewCard(db,a!,3,new Date('2026-01-01T00:00:00Z'));
   const updated=updateNote(db,note.note.id,['Updated','Different']);
   assert.deepEqual(updated.cardIds,[a,b]);
   assert.deepEqual(getSchedule(db,a!),before);
   assert.equal(reviewHistory(db,a!).length,1);
   retireNote(db,note.note.id);
   assert.equal((db.prepare('SELECT COUNT(*) AS n FROM cards').get() as {n:number}).n,2);
   assert.deepEqual(generatedCards(db,note.note.id).map(c=>c.retired),[true,true]);
   assert.deepEqual(listNotes(db,deckId),[]);
   assert.throws(()=>getNote(db,note.note.id),/retired/);
   assert.deepEqual(getSchedule(db,a!),before);
 }finally{db.close();}
});
test('structured choice/select/order/occlusion validation and generation',()=>{
 const choices=JSON.stringify([{id:'a',text:'Array'},{id:'hash',text:'Hash table'}]);
 const multi=createNote;
 const {db,deckId}=setup();
 try{
   assert.equal(multi(db,deckId,'multiple-choice',['Which? ',choices,'hash','Why']).cardIds.length,1);
   assert.equal(multi(db,deckId,'multiple-select',['Which?',choices,'["a","hash"]','']).cardIds.length,1);
   assert.equal(multi(db,deckId,'ordering',['Sort',choices,'']).cardIds.length,1);
   const image='deez-media://sha256:'+'0'.repeat(64);
   const masks=JSON.stringify([{id:2,x:0.1,y:0.2,width:0.3,height:0.4,answer:'Left'},
     {id:1,x:0.5,y:0.2,width:0.2,height:0.2,answer:'Right'}]);
   const o=multi(db,deckId,'image-occlusion',[image,masks,'Extra']);
   assert.equal(o.cardIds.length,2);
   assert.deepEqual(generatedCards(db,o.note.id).map(c=>c.key),
     ['note:'+o.note.id+':occlusion:1','note:'+o.note.id+':occlusion:2']);
   assert.throws(()=>generateCards(1,'multiple-choice',['x',choices,'missing','']),/Correct ID/);
   assert.throws(()=>generateCards(1,'multiple-select',['x',choices,'["a","a"]','']),/unique/);
   assert.throws(()=>generateCards(1,'multiple-choice',['x','[{"id":"x","text":"A"},{"id":"x","text":"B"}]','x','']),/Duplicate/);
   assert.throws(()=>generateCards(1,'image-occlusion',[image,'[{"id":1,"x":0.9,"y":0,"width":0.5,"height":0.1,"answer":"x"}]','']),/rectangle/);
   assert.throws(()=>generateCards(1,'ordering',['x','[]','']),/Choices/);
 }finally{db.close();}
});
