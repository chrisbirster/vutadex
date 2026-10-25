import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/migrate.ts';
import { createDeck } from '../services/decks.ts';
import { createCard } from '../services/cards.ts';
import { getSchedule, reviewCard, reviewHistory, undoReview } from '../services/reviews.ts';
import { retrievability } from '../fsrs/algorithm.ts';
import type { Schedule } from '../models/review.ts';

function randomSequence(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state;
  };
}

test('generated review and undo sequences preserve saved schedules and event history', () => {
  const ratings = [1, 2, 3, 4] as const;

  for (let seed = 1; seed <= 8; seed++) {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('PRAGMA foreign_keys = ON');
      migrate(db);
      const deck = createDeck(db, 'Review ' + seed);
      const card = createCard(db, deck.id, 'Prompt', 'Answer');
      const next = randomSequence(seed);
      const active: Schedule[] = [];
      let expectedEventCount = 0;

      for (let step = 0; step < 48; step++) {
        const now = new Date(Date.UTC(2026, 0, step + 1));
        const before = active.at(-1) ?? null;
        const shouldUndo = next() % 5 === 0;

        if (shouldUndo) {
          if (active.length === 0) {
            assert.throws(() => undoReview(db, card.id, now), /No active review/);
          } else {
            const expectedRestored = active.length > 1 ? active[active.length - 2]! : null;
            assert.deepEqual(undoReview(db, card.id, now), expectedRestored);
            active.pop();
            expectedEventCount++;
          }
        } else {
          const rating = ratings[next() % ratings.length]!;
          const reviewed = reviewCard(db, card.id, rating, now);
          assert.equal(reviewed.reviewCount, active.length + 1);
          assert.equal(reviewed.lastReviewAt, now.toISOString());
          assert.ok(Date.parse(reviewed.dueAt) > now.getTime());
          active.push(reviewed);
          expectedEventCount++;
        }

        const current = getSchedule(db, card.id);
        assert.deepEqual(current, active.at(-1) ?? null, 'seed ' + seed + ', step ' + step);
        assert.equal(reviewHistory(db, card.id).length, expectedEventCount);

        if (current) {
          const { stability, difficulty, fastStability } = current.state;
          assert.ok(Number.isFinite(stability) && stability >= 1e-4 && stability <= 36500);
          assert.ok(Number.isFinite(fastStability) && fastStability >= 1e-4 && fastStability <= 36500);
          assert.ok(Number.isFinite(difficulty) && difficulty >= 1 && difficulty <= 10);
          const recall = retrievability(current.state, 1);
          assert.ok(Number.isFinite(recall) && recall >= 0 && recall <= 1);
        }

        if (current && step % 9 === 0) {
          assert.throws(
            () => reviewCard(db, card.id, 3, new Date('2025-01-01T00:00:00Z')),
            /precedes previous review/,
          );
          assert.deepEqual(getSchedule(db, card.id), current);
          assert.equal(reviewHistory(db, card.id).length, expectedEventCount);
        }
      }
    } finally {
      db.close();
    }
  }
});
