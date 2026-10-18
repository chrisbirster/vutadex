import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/schema.ts';
import { createDeck, deleteDeck, describeDeck, getDeck, listDecks, renameDeck } from '../services/decks.ts';

test('create, list, rename, describe, and delete a deck', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db);
    const a = createDeck(db, ' Spanish ', 'Vocabulary');
    assert.equal(a.name, 'Spanish');
    assert.equal(a.description, 'Vocabulary');
    assert.equal(listDecks(db).length, 1);
    assert.equal(renameDeck(db, a.id, 'French').name, 'French');
    assert.equal(describeDeck(db, a.id, null).description, null);
    assert.equal(describeDeck(db, a.id, 'Basics').description, 'Basics');
    assert.equal(getDeck(db, a.id).card_count, 0);
    deleteDeck(db, a.id);
    assert.equal(listDecks(db).length, 0);
    assert.throws(() => getDeck(db, a.id), /not found/);
  } finally {
    db.close();
  }
});

test('validates deck names, duplicate names, IDs and descriptions', () => {
  const db = new DatabaseSync(':memory:');
  try {
    migrate(db);
    createDeck(db, 'Spanish');
    assert.throws(() => createDeck(db, ' spanish '), /already exists/);
    assert.throws(() => createDeck(db, '  '), /name/);
    assert.throws(() => createDeck(db, 'x'.repeat(121)), /name/);
    assert.throws(() => createDeck(db, 'hello\nworld'), /name/);
    assert.throws(() => createDeck(db, 'Other', 'x'.repeat(2001)), /Description/);
    assert.throws(() => renameDeck(db, 99, 'New'), /not found/);
  } finally {
    db.close();
  }
});

test('deleting a deck cascades to cards and schema migration is repeatable', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db);
    migrate(db);
    const deck = createDeck(db, 'Cards');
    db.prepare('INSERT INTO cards(deck_id,front,back) VALUES (?,?,?)').run(deck.id, 'a', 'b');
    assert.equal(getDeck(db, deck.id).card_count, 1);
    deleteDeck(db, deck.id);
    const row = db.prepare('SELECT COUNT(*) AS count FROM cards').get() as { count: number };
    assert.equal(row.count, 0);
  } finally {
    db.close();
  }
});
