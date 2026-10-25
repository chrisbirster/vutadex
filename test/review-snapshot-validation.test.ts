import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/migrate.ts';
import { createDeck } from '../services/decks.ts';
import { createCard } from '../services/cards.ts';
import { getSchedule, reviewCard, reviewHistory, undoReview } from '../services/reviews.ts';

function setup(): { db: DatabaseSync; cardId: number } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  const deck = createDeck(db, 'Integrity');
  return { db, cardId: createCard(db, deck.id, 'Front', 'Back').id };
}

test('corrupt persisted FSRS state is rejected before subsequent reviews', () => {
  const { db, cardId } = setup();
  try {
    reviewCard(db, cardId, 3, new Date('2026-01-01T00:00:00Z'));
    const count = reviewHistory(db, cardId).length;

    db.prepare('UPDATE card_schedules SET stability=? WHERE card_id=?').run(-1, cardId);
    assert.throws(() => getSchedule(db, cardId), /Corrupt stored review schedule/);
    assert.throws(
      () => reviewCard(db, cardId, 3, new Date('2026-01-02T00:00:00Z')),
      /Corrupt stored review schedule/,
    );
    assert.equal(reviewHistory(db, cardId).length, count);

    db.prepare('UPDATE card_schedules SET stability=?, last_review_at=? WHERE card_id=?')
      .run(1, 'not-a-date', cardId);
    assert.throws(() => getSchedule(db, cardId), /Corrupt stored review schedule/);
    assert.equal(reviewHistory(db, cardId).length, count);
  } finally { db.close(); }
});

test('undo refuses malformed JSON and invalid snapshots without changing schedule', () => {
  const { db, cardId } = setup();
  try {
    reviewCard(db, cardId, 3, new Date('2026-01-01T00:00:00Z'));
    reviewCard(db, cardId, 2, new Date('2026-01-02T00:00:00Z'));
    const previous = getSchedule(db, cardId);
    const events = reviewHistory(db, cardId);
    const id = events.at(-1)?.id;
    const originalSnapshot = events.at(-1)?.before_json;
    assert.ok(id);
    assert.ok(originalSnapshot);

    db.prepare('UPDATE review_events SET before_json=? WHERE id=?').run('{', id);
    assert.throws(() => undoReview(db, cardId), /Corrupt stored review schedule/);
    assert.deepEqual(getSchedule(db, cardId), previous);
    assert.equal(reviewHistory(db, cardId).length, events.length);

    db.prepare('UPDATE review_events SET before_json=? WHERE id=?')
      .run(JSON.stringify({ reviewCount: -1 }), id);
    assert.throws(() => undoReview(db, cardId), /Corrupt stored review schedule/);
    assert.deepEqual(getSchedule(db, cardId), previous);
    assert.equal(reviewHistory(db, cardId).length, events.length);

    // Restoring the original snapshot permits the same undo, and no data is lost.
    db.prepare('UPDATE review_events SET before_json=? WHERE id=?').run(originalSnapshot, id);
    const restored = undoReview(db, cardId);
    assert.equal(restored?.reviewCount, 1);
    assert.equal(reviewHistory(db, cardId).length, events.length + 1);
  } finally { db.close(); }
});
