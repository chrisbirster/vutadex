import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectLegacyDb} from '../scripts/legacy-inspect.ts';

test('M8 reports CLI counts without modifying source or leaking card content',()=>{
  const dir=mkdtempSync(join(tmpdir(),'vutadex-legacy-inspect-')),file=join(dir,'legacy.db');
  try{
    const db=new DatabaseSync(file);
    db.exec("CREATE TABLE decks(id INTEGER PRIMARY KEY,name TEXT);"+
      "CREATE TABLE cards(id INTEGER PRIMARY KEY,deck_id INTEGER,front TEXT,back TEXT);"+
      "CREATE TABLE notes(id INTEGER PRIMARY KEY,note_type TEXT);"+
      "CREATE TABLE generated_cards(card_id INTEGER PRIMARY KEY,note_id INTEGER);"+
      "CREATE TABLE review_events(id INTEGER PRIMARY KEY,event_type TEXT);"+
      "PRAGMA user_version=5;"+
      "INSERT INTO decks VALUES(1,'private deck');"+
      "INSERT INTO cards VALUES(1,1,'PRIVATE QUESTION','PRIVATE ANSWER');"+
      "INSERT INTO notes VALUES(1,'basic');"+
      "INSERT INTO review_events VALUES(1,'review');");
    db.close();
    const before=createHash('sha256').update(readFileSync(file)).digest('hex');
    const report=inspectLegacyDb(file);
    const after=createHash('sha256').update(readFileSync(file)).digest('hex');
    assert.equal(before,after);
    assert.equal(report.schemaVersion,5);
    assert.equal(report.tables.cards,1);
    assert.equal(report.noteTypes.basic,1);
    assert.equal(report.reviewEvents.reviews,1);
    assert.equal(report.migrationReady,false);
    assert.ok(!JSON.stringify(report).includes('PRIVATE'));
    assert.ok(!JSON.stringify(report).includes('private deck'));
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('M8 refuses unknown or unmigrated CLI schemas',()=>{
  const dir=mkdtempSync(join(tmpdir(),'vutadex-legacy-unknown-')),file=join(dir,'unknown.db');
  try{
    const db=new DatabaseSync(file);db.exec('PRAGMA user_version=6');db.close();
    assert.throws(()=>inspectLegacyDb(file),/Unsupported CLI schema/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
