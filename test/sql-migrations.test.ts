import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/schema.ts';
import { createDeck } from '../services/decks.ts';
import { addCard } from '../services/cards.ts';
import { reviewCard, getSchedule, reviewHistory } from '../services/reviews.ts';
import { createNote, generatedCards } from '../services/notes.ts';

const sqlFiles=['001_initial.sql','002_fsrs.sql','003_study_sessions.sql','004_notes.sql'];

test('migration scripts contain DDL only and match the historical schema objects',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    for(const name of sqlFiles){
      const script=readFileSync(new URL('../database/migrations/'+name,import.meta.url),'utf8');
      assert.ok(script.includes('CREATE TABLE'));
      assert.doesNotMatch(script,/\b(?:BEGIN|COMMIT|ROLLBACK)\b/i);
      assert.doesNotMatch(script,/\bPRAGMA\s+user_version\b/i);
    }
    migrate(db);
    const objects=(db.prepare("SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as unknown as Array<{type:string;name:string}>).map(x=>x.name);
    for(const expected of [
      'decks','cards','card_schedules','review_events','review_events_card_idx',
      'review_events_undo_unique','card_schedules_due_idx','study_sessions',
      'study_one_active_session','study_session_items','study_session_items_pending',
      'notes','notes_deck_idx','generated_cards','generated_cards_note_idx'
    ])assert.ok(objects.includes(expected),expected);
    assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,4);
    assert.equal((db.prepare('PRAGMA foreign_key_check').all()).length,0);
  }finally{db.close();}
});

test('SQL migration runner upgrades each historical starting version without erasing user data',()=>{
  for(let start=0;start<=4;start++){
    const db=new DatabaseSync(':memory:');
    try {
      db.exec('PRAGMA foreign_keys=ON');
      for(let i=0;i<start;i++){
        db.exec(readFileSync(new URL('../database/migrations/'+sqlFiles[i],import.meta.url),'utf8'));
        db.exec('PRAGMA user_version='+String(i+1));
      }
      let savedCard=0;
      if(start>=1){
        const deck=createDeck(db,'Before migration '+start);
        savedCard=addCard(db,deck.id,'Unchanged','Preserved').id;
      }
      let before:null|ReturnType<typeof getSchedule>=null;
      if(start>=2 && savedCard) before=reviewCard(db,savedCard,3,new Date('2026-02-02T00:00:00Z'));
      migrate(db);
      migrate(db);
      assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,4);
      if(savedCard){
        const row=db.prepare('SELECT front,back FROM cards WHERE id=?').get(savedCard) as {front:string;back:string};
        assert.deepEqual(row,{front:'Unchanged',back:'Preserved'});
        if(before){
          assert.deepEqual(getSchedule(db,savedCard),before);
          assert.equal(reviewHistory(db,savedCard).length,1);
        }
      }
      assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
    }finally{db.close();}
  }
});

test('failed historical SQL migration rolls back both DDL and version, then retries safely',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(readFileSync(new URL('../database/migrations/001_initial.sql',import.meta.url),'utf8'));
    db.exec('PRAGMA user_version=1');
    db.exec('CREATE TABLE review_events (id INTEGER PRIMARY KEY)');
    assert.throws(()=>migrate(db),/review_events/);
    assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,1);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='card_schedules'").get(),undefined);
    db.exec('DROP TABLE review_events');
    migrate(db);
    assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,4);
  }finally{db.close();}
});

test('a migrated schema supports logical notes and FSRS schedules without resetting identities',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec('PRAGMA foreign_keys=ON');
    migrate(db);
    const deck=createDeck(db,'Migrated');
    const note=createNote(db,deck.id,'reverse',['France','Paris']);
    assert.deepEqual(note.cardIds,[1,2]);
    const before=reviewCard(db,1,3,new Date('2026-01-01T00:00:00Z'));
    migrate(db);
    assert.deepEqual(generatedCards(db,note.note.id).map(x=>x.cardId),[1,2]);
    assert.deepEqual(getSchedule(db,1),before);
  }finally{db.close();}
});
