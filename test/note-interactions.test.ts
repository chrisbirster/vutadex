import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/schema.ts';
import { createDeck } from '../services/decks.ts';
import { createNote } from '../services/notes.ts';
import { interactionForCard, evaluateAnswer, needsAnswerInput } from '../services/study-interactions.ts';

test('typed answers normalize Unicode, case and whitespace without automatically rating FSRS',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  db.exec('PRAGMA foreign_keys=ON');migrate(db);
  const deck=createDeck(db,'Typed');
  const {cardIds}=createNote(db,deck.id,'type-answer',['French for coffee','Café']);
  const interaction=interactionForCard(db,cardIds[0]!);
  assert.ok(needsAnswerInput(interaction));
  assert.equal(evaluateAnswer(interaction,'  CAFE\u0301 ').correct,true);
  assert.equal(evaluateAnswer(interaction,'tea').correct,false);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM review_events').get() as {n:number}).n,0);
 }finally{db.close();}
});
test('choice and select answers use stable IDs and reject invalid selections',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');migrate(db);
  const deck=createDeck(db,'Choice');
  const choices=JSON.stringify([{id:'a',text:'Array'},{id:'h',text:'Hash'}]);
  const c=createNote(db,deck.id,'multiple-choice',['Which? ',choices,'h','']);
  const single=interactionForCard(db,c.cardIds[0]!);
  assert.equal(evaluateAnswer(single,'2').correct,true);
  assert.equal(evaluateAnswer(single,'h').correct,true);
  assert.equal(evaluateAnswer(single,'1').correct,false);
  const s=createNote(db,deck.id,'multiple-select',['Choose both',choices,'["h","a"]','']);
  const multi=interactionForCard(db,s.cardIds[0]!);
  assert.equal(evaluateAnswer(multi,'1,2').correct,true);
  assert.equal(evaluateAnswer(multi,'h,a').correct,true);
  assert.equal(evaluateAnswer(multi,'h,h').correct,false);
  assert.equal(evaluateAnswer(multi,'1').correct,false);
 }finally{db.close();}
});
test('ordering answers are evaluated in semantic original order',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');migrate(db);
  const deck=createDeck(db,'Order');
  const items=JSON.stringify([{id:'first',text:'First'},{id:'second',text:'Second'},{id:'third',text:'Third'}]);
  const n=createNote(db,deck.id,'ordering',['Sequence',items,'']);
  const interaction=interactionForCard(db,n.cardIds[0]!);
  assert.deepEqual(interaction.choices?.map(x=>x.id),['second','third','first']);
  assert.equal(evaluateAnswer(interaction,'3,1,2').correct,true);
  assert.equal(evaluateAnswer(interaction,'1,2,3').correct,false);
 }finally{db.close();}
});
