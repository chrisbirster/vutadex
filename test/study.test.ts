import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/schema.ts';
import { createDeck, deleteDeck } from '../services/decks.ts';
import { addCard } from '../services/cards.ts';
import { getSchedule, reviewCard, reviewHistory } from '../services/reviews.ts';
import { openStudySession, nextStudyItem, rateStudyCard, skipStudyCard,
  sessionSummary, undoLastStudyReview } from '../services/study.ts';

function setup(): { db: DatabaseSync; deckId: number; cards: number[] } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  migrate(db);
  const deck = createDeck(db, 'Chemistry');
  const cards = ['a', 'b', 'c', 'd'].map(front =>
    addCard(db, deck.id, front, 'answer').id);
  return { db, deckId: deck.id, cards };
}
test('SQLite v3 migration is idempotent and preserves existing cards and schedules', () => {
  const { db, cards } = setup();
  try {
    reviewCard(db, cards[0]!, 3, new Date('2026-01-01T00:00:00Z'));
    const before = getSchedule(db, cards[0]!);
    migrate(db);
    assert.equal((db.prepare('PRAGMA user_version').get() as {user_version: number}).user_version, 3);
    assert.deepEqual(getSchedule(db, cards[0]!), before);
  } finally { db.close(); }
});
test('due sessions select reviewed cards first and observe separate new/review limits', () => {
  const { db, deckId, cards } = setup();
  try {
    reviewCard(db, cards[0]!, 3, new Date('2026-01-01T00:00:00Z'));
    const session = openStudySession(db, {deckId, newLimit: 2, reviewLimit: 1}, 'auto',
      new Date('2026-01-10T00:00:00Z'));
    assert.equal(session.total, 3);
    assert.equal(session.pending, 3);
    assert.equal(nextStudyItem(db, session.id)?.cardId, cards[0]);
    const resumed = openStudySession(db, {deckId, newLimit: 2, reviewLimit: 1}, 'auto');
    assert.equal(resumed.id, session.id);
    assert.throws(() => openStudySession(db, {deckId, newLimit: 1}), /unfinished session/);
    assert.equal(openStudySession(db, {}, 'resume').id, session.id);
    assert.throws(() => openStudySession(db, {}, 'restart', new Date('invalid')), /Invalid session date/);
  } finally { db.close(); }
});
test('ratings are atomic with queue progress, undo restores the session and no duplicates', () => {
  const { db, deckId, cards } = setup();
  try {
    const session = openStudySession(db, {deckId, newLimit: 1, reviewLimit: 0});
    const id = nextStudyItem(db, session.id)!.cardId;
    const start = new Date('2026-01-01T00:00:00Z');
    rateStudyCard(db, session.id, id, 3, start);
    assert.equal(sessionSummary(db, session.id).status, 'completed');
    assert.equal(sessionSummary(db, session.id).done, 1);
    assert.throws(() => rateStudyCard(db, session.id, id, 4, start), /already processed|no longer active/);
    assert.equal(reviewHistory(db, id).length, 1);
    assert.equal(undoLastStudyReview(db, session.id), id);
    assert.equal(getSchedule(db, id), null);
    assert.equal(sessionSummary(db, session.id).pending, 1);
    rateStudyCard(db, session.id, id, 2, new Date('2026-01-02T00:00:00Z'));
    assert.equal(sessionSummary(db, session.id).done, 1);
    assert.equal(reviewHistory(db, id).length, 3);
    assert.notEqual(cards[1], id);
  } finally { db.close(); }
});
test('skip does not review, resume keeps queue, restart abandons old session', () => {
  const { db, deckId } = setup();
  try {
    const first = openStudySession(db, {deckId, newLimit: 2});
    const item = nextStudyItem(db, first.id)!;
    skipStudyCard(db, first.id, item.cardId);
    assert.equal(sessionSummary(db, first.id).skipped, 1);
    const resumed = openStudySession(db, {}, 'resume');
    assert.equal(nextStudyItem(db, resumed.id)?.position, 1);
    const second = openStudySession(db, {deckId, newLimit: 1}, 'restart');
    assert.equal(sessionSummary(db, first.id).status, 'abandoned');
    assert.notEqual(second.id, first.id);
    assert.equal(second.pending, 1);
    assert.equal(getSchedule(db, item.cardId), null);
  } finally { db.close(); }
});
test('external review changes reject duplicate rating and preserve FSRS state', () => {
  const { db, deckId } = setup();
  try {
    const session = openStudySession(db, {deckId, newLimit: 1});
    const id = nextStudyItem(db, session.id)!.cardId;
    reviewCard(db, id, 3);
    assert.throws(() => rateStudyCard(db, session.id, id, 2), /outside this session/);
    assert.equal(reviewHistory(db, id).length, 1);
    skipStudyCard(db, session.id, id);
  } finally { db.close(); }
});
test('deleted cards are removed from pending queue by foreign keys', () => {
  const { db, deckId } = setup();
  try {
    const session = openStudySession(db, {deckId, newLimit: 4});
    deleteDeck(db, deckId);
    assert.equal(nextStudyItem(db, session.id), null);
    assert.equal(sessionSummary(db, session.id).total, 0);
  } finally { db.close(); }
});
