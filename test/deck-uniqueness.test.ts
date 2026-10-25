import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/migrate.ts';
import { createDeck, getDeck, listDecks, renameDeck } from '../services/decks.ts';
import { createCard, getCard } from '../services/cards.ts';

function withDatabase(fn: (db: DatabaseSync) => void): void {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db);
    fn(db);
  } finally {
    db.close();
  }
}

test('SQLite rejects duplicate deck names even when service validation is bypassed', () => {
  withDatabase(db => {
    const original = createDeck(db, 'Spanish');
    assert.throws(
      () => db.prepare('INSERT INTO decks (name) VALUES (?)').run('sPaNiSh'),
      /UNIQUE constraint failed/,
    );
    const different = createDeck(db, 'French');
    assert.throws(
      () => db.prepare('UPDATE decks SET name=? WHERE id=?').run('SPANISH', different.id),
      /UNIQUE constraint failed/,
    );
    assert.equal(getDeck(db, original.id).name, 'Spanish');
    assert.equal(getDeck(db, different.id).name, 'French');
  });
});

test('rename changes only the targeted name, preserving all cards and other decks', () => {
  withDatabase(db => {
    const target = createDeck(db, 'Spanish', 'Vocabulary');
    const other = createDeck(db, 'French', 'Grammar');
    const card = createCard(db, target.id, 'Hola', 'Hello');
    const beforeTarget = getDeck(db, target.id);
    const beforeOther = getDeck(db, other.id);
    const beforeCard = getCard(db, card.id);

    for (let index = 0; index < 100; index++) {
      const name = 'Spanish ' + index;
      const actual = renameDeck(db, target.id, name);
      assert.equal(actual.name, name);
      assert.deepEqual({ ...actual, name: beforeTarget.name }, { ...beforeTarget });
      assert.deepEqual(getDeck(db, other.id), beforeOther);
      assert.deepEqual(getCard(db, card.id), beforeCard);
    }
    assert.equal(listDecks(db).length, 2);
    const beforeRejected = listDecks(db);
    assert.throws(() => renameDeck(db, target.id, ' FRENCH '), /already exists/);
    assert.deepEqual(listDecks(db), beforeRejected);
  });
});

test('v4 duplicates block migration without data loss; resolving duplicates permits retry', () => {
  withDatabase(db => {
    const a = createDeck(db, 'Spanish');
    const card = createCard(db, a.id, 'Uno', 'One');
    db.exec('DROP INDEX decks_name_unique; PRAGMA user_version = 4');
    db.prepare('INSERT INTO decks(name) VALUES (?)').run('SPANISH');

    assert.throws(() => migrate(db), /UNIQUE constraint failed/);
    assert.equal(
      (db.prepare('PRAGMA user_version').get() as {user_version: number}).user_version,
      4,
    );
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM decks').get() as {count:number}).count, 2);
    assert.equal(getCard(db, card.id).front, 'Uno');
    assert.equal(
      db.prepare("SELECT name FROM sqlite_master WHERE name='decks_name_unique'").get(),
      undefined,
    );

    db.prepare('UPDATE decks SET name=? WHERE name=?').run('Italian', 'SPANISH');
    migrate(db);
    migrate(db);

    assert.equal(
      (db.prepare('PRAGMA user_version').get() as {user_version: number}).user_version,
      5,
    );
    assert.equal(listDecks(db).length, 2);
    assert.equal(getCard(db, card.id).front, 'Uno');
    assert.throws(
      () => db.prepare('INSERT INTO decks(name) VALUES (?)').run('spanish'),
      /UNIQUE constraint failed/,
    );
  });
});
