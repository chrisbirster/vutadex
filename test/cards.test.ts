import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/schema.ts';
import { createDeck } from '../services/decks.ts';
import { addCard, editCard, getCard, listCards, deleteCard, parsePositiveId } from '../services/cards.ts';

test('card CRUD, multiline, search, deck isolation and cascading delete', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db);
    const a = createDeck(db, 'A');
    const b = createDeck(db, 'B');
    const card = addCard(db, a.id, '  Line 1\nLine 2 ', ' Answer ');
    addCard(db, b.id, 'Line 1', 'Elsewhere');
    assert.equal(getCard(db, card.id).front, 'Line 1\nLine 2');
    assert.equal(listCards(db, a.id).length, 1);
    assert.equal(listCards(db, a.id, 'line 2').length, 1);
    assert.equal(listCards(db, b.id, 'Answer').length, 0);
    assert.equal(editCard(db, card.id, undefined, 'Changed').front, 'Line 1\nLine 2');
    assert.equal(getCard(db, card.id).back, 'Changed');
    deleteCard(db, card.id);
    assert.throws(() => getCard(db, card.id), /not found/);
    db.prepare('DELETE FROM decks WHERE id = ?').run(b.id);
    assert.equal(listCards(db, a.id).length, 0);
  } finally { db.close(); }
});

test('card inputs and missing references are rejected', () => {
  const db = new DatabaseSync(':memory:');
  try {
    migrate(db);
    const deck = createDeck(db, 'A');
    for (const id of ['0', '-1', '1x', '9007199254740992']) assert.throws(() => parsePositiveId(id), /positive integer/);
    assert.throws(() => addCard(db, 99, 'a', 'b'), /not found/);
    assert.throws(() => addCard(db, deck.id, '', 'b'), /Front/);
    assert.throws(() => addCard(db, deck.id, 'a', '\0'), /Back/);
    assert.throws(() => addCard(db, deck.id, 'x'.repeat(10001), 'b'), /Front/);
    assert.throws(() => listCards(db, deck.id, '  '), /query/);
    assert.throws(() => editCard(db, 99, 'x'), /not found/);
  } finally { db.close(); }
});
