import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/migrate.ts';
import { createDeck } from '../services/decks.ts';
import { createNote } from '../services/notes.ts';
import { exportDeck } from '../services/deck-file.ts';
import { importDeckFile, parseDeckFile } from '../services/deck-import.ts';
import { reviewCard, reviewHistory } from '../services/reviews.ts';

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  migrate(db);
  return db;
}

test('round-trip logical notes into a new deck with fresh learning state', () => {
  const db = setup();
  try {
    const id = createDeck(db, 'Original').id;
    const note = createNote(db, id, 'reverse', ['France', 'Paris'], ['geography']);
    reviewCard(db, note.cardIds[0]!, 3, new Date('2026-01-01T00:00:00Z'));
    const imported = importDeckFile(db, exportDeck(db, id).replace('"Original"', '"Copy"'));
    assert.equal(imported.notes, 1);
    const notes = db.prepare('SELECT note_type, fields_json, tags_json FROM notes WHERE deck_id=?')
      .all(imported.deckId) as {note_type:string;fields_json:string;tags_json:string}[];
    assert.equal(notes[0]?.note_type, 'reverse');
    assert.deepEqual(JSON.parse(notes[0]!.fields_json), ['France', 'Paris']);
    assert.deepEqual(JSON.parse(notes[0]!.tags_json), ['geography']);
    const newCards = db.prepare('SELECT id FROM cards WHERE deck_id=?').all(imported.deckId) as {id:number}[];
    assert.equal(newCards.length, 2);
    assert.deepEqual(reviewHistory(db, newCards[0]!.id), []);
    assert.equal(reviewHistory(db, note.cardIds[0]!).length, 1);
  } finally { db.close(); }
});

test('rejects malformed records and media without altering the database', () => {
  const db = setup();
  const header = '{"kind":"deck","format":"plandalf.deck","version":2,"name":"Imported"}';
  const good = '{"kind":"note","note_type":"basic","fields":["Question","Answer"],"tags_json":"[]"}';
  try {
    for (const input of [
      '', '{}', header.replace('"version":2', '"version":9'), header + '\nno-json',
      header + '\n' + good.replace('"basic"','"unknown"'),
      header + '\n' + good.replace('"tags_json":"[]"','"tags_json":"[1]"'),
      header + '\n' + good.replace('"Answer"','""'),
      header + '\n' + good.replace('"note_type"', '"extra"')
    ]) {
      assert.throws(() => importDeckFile(db, input));
      assert.equal((db.prepare('SELECT COUNT(*) AS n FROM decks').get() as {n:number}).n, 0);
    }
    assert.equal(parseDeckFile(header).notes.length, 0);
    const broken = header + '\n' + good;
    db.exec('CREATE TRIGGER abort_import BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT, \'fail\'); END');
    assert.throws(() => importDeckFile(db, broken), /fail/);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM decks').get() as {n:number}).n, 0);
  } finally { db.close(); }
});
