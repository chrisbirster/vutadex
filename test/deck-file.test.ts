import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/migrate.ts';
import { createDeck } from '../services/decks.ts';
import { createCard } from '../services/cards.ts';
import { createNote, retireNote } from '../services/notes.ts';
import { exportDeck, DeckFileError } from '../services/deck-file.ts';
import { reviewCard, reviewHistory } from '../services/reviews.ts';

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  migrate(db);
  const id = createDeck(db, 'Geography').id;
  return { db, id };
}

test('v2 export is NDJSON logical notes plus legacy manual cards; no study history', () => {
  const { db, id } = setup();
  try {
    const reverse = createNote(db, id, 'reverse', ['France', 'Paris'], ['geo']);
    const cloze = createNote(db, id, 'cloze', ['{{c1::Paris}} is in France', '']);
    const retired = createNote(db, id, 'basic', ['Retired', 'Excluded']);
    retireNote(db, retired.note.id);
    createCard(db, id, 'Legacy question', 'Legacy answer');
    reviewCard(db, reverse.cardIds[0]!, 3, new Date('2026-01-01T00:00:00Z'));
    const before = reviewHistory(db, reverse.cardIds[0]!);
    const data = exportDeck(db, id);
    const lines = data.trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>);
    assert.deepEqual(lines[0], {kind:'deck',format:'plandalf.deck',version:2,name:'Geography'});
    assert.deepEqual(lines.slice(1), [
      {kind:'note',note_type:'reverse',fields:['France','Paris'],tags_json:'["geo"]'},
      {kind:'note',note_type:'cloze',fields:['{{c1::Paris}} is in France',''],tags_json:'[]'},
      {kind:'note',note_type:'basic',fields:['Legacy question','Legacy answer'],tags_json:'[]'}
    ]);
    assert.equal(exportDeck(db, id), data);
    assert.doesNotMatch(data, /due_at|review_history|card_id|stability|difficulty/);
    assert.deepEqual(reviewHistory(db, reverse.cardIds[0]!), before);
    assert.equal(cloze.cardIds.length, 1);
  } finally { db.close(); }
});

test('image occlusion export fails closed instead of emitting broken media references', () => {
  const { db, id } = setup();
  try {
    createNote(db, id, 'image-occlusion', [
      'deez-media://sha256:' + '0'.repeat(64),
      '[{"id":1,"x":0.1,"y":0.1,"width":0.2,"height":0.2,"answer":"A"}]', ''
    ]);
    assert.throws(() => exportDeck(db, id), DeckFileError);
  } finally { db.close(); }
});
