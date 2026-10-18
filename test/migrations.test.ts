import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listMigrations } from '../database/sql.ts';

function withMigrationFiles(names: string[], run: (directory: string) => void): void {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'vutadex-migrations-'));
  try {
    for (const name of names) writeFileSync(path.join(directory, name), '');
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('shipped migrations are discovered in order', () => {
  const found = listMigrations();
  assert.ok(found.length >= 4);
  assert.equal(found[0], '001_initial.sql');
});

test('migrations are sorted by number, ignoring other files', () => {
  withMigrationFiles(['002_b.sql', '001_a.sql', 'notes.txt', '.001_a.sql.swp'], directory => {
    assert.deepEqual(listMigrations(directory), ['001_a.sql', '002_b.sql']);
  });
});

test('unpadded numbers sort numerically', () => {
  const names = Array.from({ length: 10 }, (_, index) => `${index + 1}_m.sql`);
  withMigrationFiles(names, directory => {
    assert.deepEqual(listMigrations(directory), names);
  });
});

test('a gap in the numbering is rejected', () => {
  withMigrationFiles(['001_a.sql', '002_b.sql', '004_d.sql'], directory => {
    assert.throws(() => listMigrations(directory), /004_d\.sql is out of sequence; expected version 3/);
  });
});

test('a duplicate number is rejected', () => {
  withMigrationFiles(['001_a.sql', '001_b.sql'], directory => {
    assert.throws(() => listMigrations(directory), /out of sequence/);
  });
});
