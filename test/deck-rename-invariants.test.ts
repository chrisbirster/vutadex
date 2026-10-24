import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/migrate.ts';
import { createCard, getCard, listCards } from '../services/cards.ts';
import { createDeck, getDeck, listDecks, renameDeck } from '../services/decks.ts';

function withDatabase(run: (db: DatabaseSync) => void): void {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db);
    run(db);
  } finally {
    db.close();
  }
}

test('deck rename preserves identity, metadata, cards and every other deck', () => {
  withDatabase(db => {
    const target = createDeck(db, 'Spanish', 'Vocabulary');
    const other = createDeck(db, 'Geography', 'Countries');
    const card = createCard(db, target.id, 'hola', 'hello');

    const targetBefore = getDeck(db, target.id);
    const otherBefore = getDeck(db, other.id);
    const cardsBefore = listCards(db, target.id);
    const cardBefore = getCard(db, card.id);

    const renamed = renameDeck(db, target.id, 'Spanish Basics');

    assert.equal(renamed.name, 'Spanish Basics');
    assert.deepEqual(
      { ...renamed, name: targetBefore.name },
      targetBefore,
      'only the target deck name should change',
    );
    assert.deepEqual(getDeck(db, other.id), otherBefore);
    assert.deepEqual(listCards(db, target.id), cardsBefore);
    assert.deepEqual(getCard(db, card.id), cardBefore);
    assert.equal(listDecks(db).length, 2);

    // Renaming to a case variant of the deck's own name is permitted.
    assert.equal(
      renameDeck(db, target.id, 'spanish basics').name,
      'spanish basics',
    );
  });
});

test('rejected deck renames leave the database unchanged', () => {
  withDatabase(db => {
    const target = createDeck(db, 'Spanish', 'Vocabulary');
    createDeck(db, 'French', 'Grammar');
    const card = createCard(db, target.id, 'uno', 'one');

    const beforeDecks = listDecks(db);
    const beforeCard = getCard(db, card.id);

    assert.throws(
      () => renameDeck(db, target.id, ' french '),
      /already exists/,
    );
    assert.throws(
      () => renameDeck(db, target.id, '  '),
      /name/,
    );
    assert.throws(
      () => renameDeck(db, 99999, 'New'),
      /not found/,
    );

    assert.deepEqual(listDecks(db), beforeDecks);
    assert.deepEqual(getCard(db, card.id), beforeCard);
  });
});
