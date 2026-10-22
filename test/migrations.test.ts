import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { listMigrationFiles } from '../database/sql.ts';

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/migrations/${name}/`, import.meta.url));
}

test('migrations are sorted by number, ignoring other files', () => {
  assert.deepEqual(listMigrationFiles(fixture('unsorted-with-extras')), ['001_a.sql', '002_b.sql']);
});

test('unpadded numbers sort numerically', () => {
  const names = Array.from({ length: 10 }, (_, index) => `${index + 1}_m.sql`);
  assert.deepEqual(listMigrationFiles(fixture('unpadded')), names);
});

test('a gap in the numbering is rejected', () => {
  assert.throws(() => listMigrationFiles(fixture('gap')), /004_d\.sql is out of sequence; expected version 3/);
});
