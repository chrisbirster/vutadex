import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/migrate.ts';
import { createDeck } from '../services/decks.ts';
import { createNote, updateNote, retireNote, getNote, generatedCards } from '../services/notes.ts';
import { getCard } from '../services/cards.ts';
import { getSchedule, reviewCard, reviewHistory } from '../services/reviews.ts';

function withDatabase(run: (db: DatabaseSync) => void): void {
  const db = new DatabaseSync(':memory:');
  try { db.exec('PRAGMA foreign_keys = ON'); migrate(db); run(db); }
  finally { db.close(); }
}

test('a card insertion failure atomically rolls back note creation and leaves no generated cards', () => {
  withDatabase(db => {
    const deck = createDeck(db, 'Create rollback');
    db.exec("CREATE TRIGGER reject_card_create BEFORE INSERT ON cards WHEN NEW.front = 'Trigger failure' BEGIN SELECT RAISE(ABORT, 'injected create failure'); END");
    assert.throws(() => createNote(db, deck.id, 'basic', ['Trigger failure', 'Answer']), /injected create failure/);
    for(const table of ['notes','generated_cards','cards']) {
      assert.equal((db.prepare('SELECT COUNT(*) AS n FROM ' + table).get() as {n:number}).n, 0);
    }
    db.exec('DROP TRIGGER reject_card_create');
    const created = createNote(db, deck.id, 'basic', ['Works', 'Answer']);
    assert.equal(created.cardIds.length, 1);
    assert.equal(getNote(db, created.note.id).fields[0], 'Works');
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  });
});

test('failure regenerating note cards preserves fields, IDs, FSRS state and reviews', () => {
  withDatabase(db => {
    const deck = createDeck(db, 'Update rollback');
    const created = createNote(db, deck.id, 'reverse', ['Original', 'Answer']);
    const cardId = created.cardIds[0]!;
    reviewCard(db, cardId, 3, new Date('2026-06-01T00:00:00.000Z'));
    const schedule = getSchedule(db, cardId);
    const eventCount = reviewHistory(db, cardId).length;
    const cardsBefore = generatedCards(db, created.note.id);
    db.exec("CREATE TRIGGER reject_card_update BEFORE UPDATE ON cards WHEN NEW.front = 'Trigger failure' BEGIN SELECT RAISE(ABORT, 'injected update failure'); END");
    assert.throws(() => updateNote(db, created.note.id, ['Trigger failure', 'Replacement']), /injected update failure/);
    assert.deepEqual(getNote(db, created.note.id).fields, ['Original', 'Answer']);
    assert.deepEqual(generatedCards(db, created.note.id), cardsBefore);
    assert.equal(getCard(db, cardId).front, 'Original');
    assert.deepEqual(getSchedule(db, cardId), schedule);
    assert.equal(reviewHistory(db, cardId).length, eventCount);
    db.exec('DROP TRIGGER reject_card_update');
    const after = updateNote(db, created.note.id, ['Updated', 'Answer']);
    assert.deepEqual(after.cardIds, created.cardIds);
    assert.deepEqual(getSchedule(db, cardId), schedule);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  });
});

test('failure retiring generated cards rolls back note retirement and allows a retry', () => {
  withDatabase(db => {
    const deck = createDeck(db, 'Retirement rollback');
    const created = createNote(db, deck.id, 'basic', ['Q', 'A']);
    const cardId = created.cardIds[0]!;
    db.exec("CREATE TRIGGER reject_card_retire BEFORE UPDATE OF retired ON generated_cards WHEN NEW.retired = 1 BEGIN SELECT RAISE(ABORT, 'injected retirement failure'); END");
    assert.throws(() => retireNote(db, created.note.id), /injected retirement failure/);
    assert.equal(getNote(db, created.note.id).retired, false);
    assert.deepEqual(generatedCards(db, created.note.id).map(x => x.retired), [false]);
    assert.equal(getCard(db, cardId).front, 'Q');
    db.exec('DROP TRIGGER reject_card_retire');
    retireNote(db, created.note.id);
    assert.throws(() => getNote(db, created.note.id), /retired/);
    assert.deepEqual(generatedCards(db, created.note.id).map(x => x.retired), [true]);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  });
});
