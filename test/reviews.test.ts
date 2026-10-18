import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/schema.ts';
import { createDeck } from '../services/decks.ts';
import { addCard } from '../services/cards.ts';
import { reviewCard, undoReview, getSchedule, dueCards, reviewHistory } from '../services/reviews.ts';
import { FSRS_VERSION } from '../fsrs/parameters.ts';

function setup(): { db: DatabaseSync; cardId: number } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  const deck = createDeck(db, 'Spanish');
  const card = addCard(db, deck.id, 'hola', 'hello');
  return { db, cardId: card.id };
}

test('v1->v2 database upgrades in place and migration is idempotent', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA user_version=1');
    db.exec('CREATE TABLE cards (id INTEGER PRIMARY KEY, deck_id INTEGER, front TEXT, back TEXT)');
    // v1 includes original decks table; migration v2 must not replace existing data.
    db.exec('INSERT INTO cards VALUES (1, 1, \'old\', \'card\')');
    migrate(db);
    migrate(db);
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    assert.equal(version.user_version, 2);
    assert.equal((db.prepare('SELECT front FROM cards WHERE id=1').get() as { front: string }).front, 'old');
  } finally { db.close(); }
});

test('rating saves a schedule and append-only events; due works', () => {
  const {db, cardId} = setup();
  try {
    const t0 = new Date('2026-01-01T12:00:00.000Z');
    assert.equal(getSchedule(db, cardId), null);
    assert.equal(dueCards(db, undefined, t0).length, 1);
    const first = reviewCard(db, cardId, 3, t0);
    assert.equal(first.reviewCount, 1);
    assert.ok(Date.parse(first.dueAt) > t0.getTime());
    assert.equal(dueCards(db, undefined, t0).length, 0);
    assert.equal(dueCards(db, undefined, new Date('2100-01-01T00:00:00.000Z')).length, 1);
    const next = reviewCard(db, cardId, 1, new Date('2026-01-02T12:00:00.000Z'));
    assert.equal(next.reviewCount, 2);
    const events = reviewHistory(db, cardId);
    assert.deepEqual(events.map(e=>e.rating), [3,1]);
    assert.equal(events[0]?.scheduler_version, FSRS_VERSION);
    assert.equal(events[1]?.elapsed_days, 1);
    assert.ok(next.state.fastStability <= 0.8 * next.state.stability + 1e-8);
  } finally { db.close(); }
});

test('undo reverses last review without deleting historical events', () => {
  const {db, cardId} = setup();
  try {
    const t = new Date('2026-02-01T00:00:00Z');
    const first = reviewCard(db, cardId, 2, t);
    reviewCard(db, cardId, 4, new Date('2026-02-02T00:00:00Z'));
    assert.deepEqual(undoReview(db, cardId), first);
    assert.deepEqual(getSchedule(db, cardId), first);
    assert.equal(undoReview(db, cardId), null);
    assert.equal(getSchedule(db, cardId), null);
    assert.equal(dueCards(db).length, 1);
    assert.deepEqual(reviewHistory(db, cardId).map(r=>r.event_type), ['review','review','undo','undo']);
    assert.throws(() => undoReview(db, cardId), /No active review/);
  } finally { db.close(); }
});

test('invalid and out-of-order reviews roll back atomically', () => {
  const {db, cardId} = setup();
  try {
    const t = new Date('2026-01-20T12:00:00Z');
    reviewCard(db, cardId, 3, t);
    assert.throws(() => reviewCard(db, cardId, 3, new Date('2026-01-19T12:00:00Z')), /precedes/);
    assert.throws(() => reviewCard(db, cardId, 9 as 1, t), /Rating/);
    assert.equal(reviewHistory(db, cardId).length, 1);
    assert.equal(getSchedule(db, cardId)?.reviewCount, 1);
  } finally { db.close(); }
});
