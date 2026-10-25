import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/migrate.ts';
import { createDeck, deleteDeck, describeDeck, getDeck, listDecks, renameDeck } from '../services/decks.ts';
import { createCard, getCard } from '../services/cards.ts';

interface ExpectedDeck {
  name: string;
  description: string | null;
  createdAt: string;
  cardId: number;
}

/** Repeatable generated command sequences: a failed seed can always be replayed. */
function randomSequence(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state;
  };
}

test('generated deck command sequences preserve ownership, uniqueness and unrelated state', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('PRAGMA foreign_keys = ON');
      migrate(db);
      const next = randomSequence(seed);
      const expected = new Map<number, ExpectedDeck>();
      let nextName = 0;

      for (let step = 0; step < 90; step++) {
        const ids = [...expected.keys()];
        const action = ids.length === 0 ? 0 : next() % 5;

        if (action === 0) {
          const name = 'Deck ' + seed + '-' + nextName++;
          const deck = createDeck(db, name);
          const card = createCard(db, deck.id, 'Front', 'Back');
          expected.set(deck.id, {
            name,
            description: null,
            createdAt: deck.created_at,
            cardId: card.id,
          });
        } else {
          const id = ids[next() % ids.length]!;
          const before = expected.get(id)!;

          switch (action) {
            case 1: {
              const name = 'Renamed ' + seed + '-' + nextName++;
              assert.equal(renameDeck(db, id, name).name, name);
              expected.set(id, { ...before, name });
              break;
            }
            case 2: {
              const description = next() % 2 === 0 ? null : 'Description ' + nextName++;
              assert.equal(describeDeck(db, id, description).description, description);
              expected.set(id, { ...before, description });
              break;
            }
            case 3: {
              deleteDeck(db, id);
              expected.delete(id);
              assert.throws(() => getDeck(db, id), /not found/);
              assert.throws(() => getCard(db, before.cardId), /not found/);
              break;
            }
            case 4: {
              const beforeAll = listDecks(db);
              const others = ids.filter(candidate => candidate !== id);
              if (others.length) {
                const otherId = others[next() % others.length]!;
                const other = expected.get(otherId)!;
                assert.throws(() => renameDeck(db, id, other.name.toUpperCase()), /already exists/);
              } else {
                assert.throws(() => renameDeck(db, id, '   '), /name/);
              }
              assert.deepEqual(listDecks(db), beforeAll, 'rejected command must preserve state');
              break;
            }
          }
        }

        const actual = listDecks(db);
        assert.equal(actual.length, expected.size, 'seed ' + seed + ', step ' + step);
        const usedNames = new Set<string>();

        for (const row of actual) {
          const want = expected.get(row.id);
          assert.ok(want, 'unexpected deck ID ' + row.id);
          assert.equal(row.name, want.name);
          assert.equal(row.description, want.description);
          assert.equal(row.created_at, want.createdAt);
          assert.equal(row.card_count, 1, 'surviving deck retains its card');
          assert.equal(getCard(db, want.cardId).deck_id, row.id);
          assert.equal(getDeck(db, row.id).name, want.name);

          const key = row.name.toLowerCase();
          assert.equal(usedNames.has(key), false, 'duplicate NOCASE deck name');
          usedNames.add(key);
        }
      }
    } finally {
      db.close();
    }
  }
});
