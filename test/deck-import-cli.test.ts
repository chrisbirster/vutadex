import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../database/migrate.ts';
import { runDeckSubcommandImport } from '../commands/deck/import.ts';

test('deck import command usage and transactional import from file', () => {
  const db = new DatabaseSync(':memory:');
  const home = mkdtempSync(join(tmpdir(), 'vdex-import-'));
  const filename = join(home, 'example.deck');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    migrate(db);
    assert.equal(runDeckSubcommandImport(db, []), 1);
    writeFileSync(filename, [
      '{"kind":"deck","format":"plandalf.deck","version":2,"name":"A Test Deck"}',
      '{"kind":"note","note_type":"basic","fields":["One","Two"],"tags_json":"[]"}'
    ].join('\n') + '\n');
    const oldLog = console.log;
    const output: string[] = [];
    try {
      console.log = (...args: unknown[]) => { output.push(args.map(String).join(' ')); };
      assert.equal(runDeckSubcommandImport(db, [filename]), 0);
    } finally { console.log = oldLog; }
    assert.match(output.join(' '), /Imported deck 1 \(1 notes\)/);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM cards').get() as {n:number}).n, 1);
  } finally { db.close(); rmSync(home, {recursive:true,force:true}); }
});
