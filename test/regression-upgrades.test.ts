import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '../database/schema.ts';
import { createDeck } from '../services/decks.ts';
import { addCard } from '../services/cards.ts';
import { reviewCard } from '../services/reviews.ts';
import { openStudySession } from '../services/study.ts';

const entry=fileURLToPath(new URL('../index.ts',import.meta.url));
function withFileDb(fn:(db:DatabaseSync,run:(args:string[],input?:string)=>ReturnType<typeof spawnSync>)=>void):void{
  const home=mkdtempSync(join(tmpdir(),'vutadex-legacy-regression-'));
  const dir=join(home,'data','vutadex');
  mkdirSync(dir,{recursive:true});
  const file=join(dir,'vdex.db');
  const db=new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys=ON');
  const env={...process.env,HOME:home,USERPROFILE:home,LOCALAPPDATA:join(home,'data'),
    XDG_DATA_HOME:join(home,'data')};
  const run=(args:string[],input='')=>spawnSync(process.execPath,[entry,...args],
    {encoding:'utf8',input,timeout:20000,env});
  try{fn(db,run);}
  finally{db.close();rmSync(home,{recursive:true,force:true});}
}

test('v1 user database upgrades in-place to v4 without deleting manual cards',()=>withFileDb((db,run)=>{
  db.exec([
    'CREATE TABLE decks (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,description TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE cards (id INTEGER PRIMARY KEY AUTOINCREMENT,deck_id INTEGER NOT NULL,front TEXT NOT NULL,back TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(deck_id) REFERENCES decks(id) ON DELETE CASCADE)',
    "INSERT INTO decks (name) VALUES ('Legacy')",
    "INSERT INTO cards (deck_id,front,back) VALUES (1,'old front','old back')",
    'PRAGMA user_version=1'
  ].join(';')+';');
  const invoked=run(['card','show','1']);
  assert.equal(invoked.status,0,invoked.stderr);
  assert.match(invoked.stdout,/old front/);
  assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,4);
  for(const table of ['card_schedules','review_events','study_sessions','study_session_items','notes','generated_cards']){
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),table);
  }
  assert.equal(run(['note','add','1','basic','new front','new back']).status,0);
  assert.match(run(['card','list','1']).stdout,/old front/);
}));

test('v2 FSRS reviews survive in-place upgrade and remain undoable',()=>withFileDb((db,run)=>{
  migrate(db);
  const deck=createDeck(db,'Preserve');
  const card=addCard(db,deck.id,'Remember','me');
  reviewCard(db,card.id,3,new Date('2026-01-01T00:00:00Z'));
  db.exec('DROP TABLE generated_cards; DROP TABLE notes; DROP TABLE study_session_items; DROP TABLE study_sessions; PRAGMA user_version=2');
  const history=run(['card','history',String(card.id)]);
  assert.equal(history.status,0,history.stderr);
  assert.match(history.stdout,/Good/);
  assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,4);
  const undo=run(['card','undo',String(card.id)]);
  assert.equal(undo.status,0,undo.stderr);
  assert.match(run(['due',String(deck.id)]).stdout,/Remember/);
}));

test('v3 active study queue persists across migration to v4',()=>withFileDb((db,run)=>{
  migrate(db);
  const deck=createDeck(db,'Resume');
  addCard(db,deck.id,'Before','After');
  openStudySession(db,{deckId:deck.id,newLimit:1});
  db.exec('DROP TABLE generated_cards; DROP TABLE notes; PRAGMA user_version=3');
  const resumed=run(['study','--resume'],'q\n');
  assert.equal(resumed.status,0,resumed.stderr);
  assert.match(resumed.stdout,/Before/);
  assert.match(resumed.stdout,/Session paused/);
  assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,4);
}));

test('newer on-disk schema is not downgraded by an older CLI',()=>withFileDb((db,run)=>{
  db.exec('PRAGMA user_version=5');
  const attempted=run(['deck','list']);
  assert.notEqual(attempted.status,0);
  assert.match(attempted.stderr,/newer version/);
  assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,5);
}));

test('a repeated migration is idempotent and retains note-to-card IDs and review events',()=>withFileDb((db,run)=>{
  migrate(db);
  const deck=createDeck(db,'Persistent');
  const note=run(['note','add',String(deck.id),'reverse','Where?','Here']);
  assert.equal(note.status,0,note.stderr);
  assert.equal(run(['card','review','1','good']).status,0);
  migrate(db);
  migrate(db);
  assert.equal(run(['note','edit','1','Updated','Here']).status,0);
  assert.match(run(['card','history','1']).stdout,/Good/);
  assert.match(run(['card','show','1']).stdout,/Updated/);
  assert.match(run(['note','show','1']).stdout,/template:1/);
}));
