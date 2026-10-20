import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/migrate.ts';
import { createDeck } from '../services/decks.ts';
import { createNote } from '../services/notes.ts';
import { runDeckSubcommandExport } from '../commands/deck/export.ts';

test('deck export CLI handles invalid arguments without writing output', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    migrate(db);
    assert.equal(runDeckSubcommandExport(db, []), 1);
    assert.equal(runDeckSubcommandExport(db, ['1', 'extra']), 1);
  } finally { db.close(); }
});

test('deck export CLI writes the content-only wire format to stdout', () => {
  const db = new DatabaseSync(':memory:');
  const original = process.stdout.write;
  const output: string[] = [];
  try {
    db.exec('PRAGMA foreign_keys=ON');
    migrate(db);
    const id = createDeck(db, 'Export Test').id;
    createNote(db, id, 'basic', ['Question', 'Answer']);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    assert.equal(runDeckSubcommandExport(db, [String(id)]), 0);
    const records = output.join('').trim().split('\n').map(x => JSON.parse(x) as {kind:string});
    assert.equal(records[0]?.kind, 'deck');
    assert.equal(records[1]?.kind, 'note');
  } finally {
    process.stdout.write = original;
    db.close();
  }
});
