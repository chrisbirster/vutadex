import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/migrate.ts';
import { createDeck,getDeck } from '../services/decks.ts';
import { addCard,editCard,deleteCard,listCards } from '../services/cards.ts';
import { reviewCard,getSchedule,reviewHistory,dueCards } from '../services/reviews.ts';
import { createNote,updateNote,generatedCards,retireNote } from '../services/notes.ts';
import { openStudySession,nextStudyItem,finishStudySession } from '../services/study.ts';

test('cloze editing retires only removed ordinals and restores FSRS on reactivation',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');migrate(db);
  const deckId=createDeck(db,'Cloze').id;
  const note=createNote(db,deckId,'cloze',['{{c1::Blue}} and {{c2::Green}}','colors']);
  assert.deepEqual(note.cardIds,[1,2]);
  const s=reviewCard(db,2,3,new Date('2026-01-01T00:00:00Z'));
  const edit=updateNote(db,note.note.id,['{{c1::Red}} only','colors']);
  assert.deepEqual(edit.cardIds,[1]);
  assert.equal(generatedCards(db,note.note.id).find(x=>x.cardId===2)?.retired,true);
  assert.equal(getDeck(db,deckId).card_count,1);
  assert.deepEqual(listCards(db,deckId).map(c=>c.id),[1]);
  assert.deepEqual(dueCards(db,deckId,new Date('2030-01-01T00:00:00Z')).map(c=>c.id),[1]);
  assert.throws(()=>reviewCard(db,2,3),/Retired/);
  assert.deepEqual(getSchedule(db,2),s);
  assert.equal(reviewHistory(db,2).length,1);
  const restored=updateNote(db,note.note.id,['{{c1::Red}} and {{c2::Green}}','colors']);
  assert.deepEqual(restored.cardIds,[1,2]);
  assert.deepEqual(getSchedule(db,2),s);
  assert.equal(getDeck(db,deckId).card_count,2);
 }finally{db.close();}
});
test('pending study queue skips retired generated cards without fabricating reviews',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');migrate(db);
  const deckId=createDeck(db,'Deck').id;
  const legacy=addCard(db,deckId,'Unmanaged','Answer');
  const note=createNote(db,deckId,'basic',['Managed','Answer']);
  const session=openStudySession(db,{deckId,newLimit:2});
  assert.equal(session.total,2);
  retireNote(db,note.note.id);
  assert.equal(getDeck(db,deckId).card_count,1);
  assert.equal(nextStudyItem(db,session.id)?.cardId,legacy.id);
  assert.deepEqual(listCards(db,deckId).map(c=>c.id),[legacy.id]);
  assert.throws(()=>editCard(db,note.cardIds[0]!,'bad'),/generated/i);
  assert.throws(()=>deleteCard(db,note.cardIds[0]!),/generated/i);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM review_events').get() as {n:number}).n,0);
  assert.equal(finishStudySession(db,session.id).skipped,1);
 }finally{db.close();}
});
test('note creation rollback does not leave a partial source or cards',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');migrate(db);
  const deckId=createDeck(db,'Test').id;
  assert.throws(()=>createNote(db,deckId,'multiple-choice',
    ['Bad','[{"id":"x","text":"A"},{"id":"y","text":"B"}]','missing','']),/Correct ID/);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM notes').get() as {n:number}).n,0);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM cards').get() as {n:number}).n,0);
 }finally{db.close();}
});
