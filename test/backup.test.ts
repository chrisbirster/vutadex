import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../database/migrate.ts';
import { createDeck } from '../services/decks.ts';
import { createBackup, restoreBackup, BackupError } from '../services/backup.ts';
import { runBackupCommand } from '../commands/backup.ts';

test('backup round-trip restores SQLite and verified media without overwriting existing data', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vdex-backup-'));
  const source = join(root, 'source');
  const target = join(root, 'target');
  const archive = join(root, 'backup.json');
  mkdirSync(source);
  const db = new DatabaseSync(join(source, 'vdex.db'));
  try {
    db.exec('PRAGMA foreign_keys=ON');
    migrate(db);
    createDeck(db, 'Restorable deck');
    const bytes = Buffer.from('GIF89a');
    const hash = createHash('sha256').update(bytes).digest('hex');
    mkdirSync(join(source, 'media'));
    writeFileSync(join(source, 'media', hash), bytes);
    await createBackup(db, archive, source);
    assert.ok(existsSync(archive));
    assert.rejects(createBackup(db, archive, source), BackupError);
    restoreBackup(archive, target);
    assert.deepEqual(readFileSync(join(target, 'media', hash)), bytes);
    const recovered = new DatabaseSync(join(target, 'vdex.db'));
    try {
      const name = recovered.prepare('SELECT name FROM decks').get() as {name:string};
      assert.equal(name.name, 'Restorable deck');
    } finally { recovered.close(); }
    assert.throws(() => restoreBackup(archive, target), BackupError);
    const corrupted = join(root, 'corrupted.json');
    const contents = JSON.parse(readFileSync(archive, 'utf8')) as {database:{sha256:string}};
    contents.database.sha256 = '0'.repeat(64);
    writeFileSync(corrupted, JSON.stringify(contents));
    assert.throws(() => restoreBackup(corrupted, join(root, 'broken')), BackupError);
    assert.equal(existsSync(join(root, 'broken')), false);
  } finally { db.close(); rmSync(root,{recursive:true,force:true}); }
});

test('backup command rejects missing arguments without accessing storage', async () => {
  assert.equal(await runBackupCommand(undefined, []), 1);
  assert.equal(await runBackupCommand('restore', []), 1);
});

test('restore preserves legacy v4 backup and upgrades it to v5 on next open', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vdex-legacy-backup-'));
  const source = join(root, 'source');
  const target = join(root, 'restored');
  const archive = join(root, 'backup.json');
  mkdirSync(source);
  const db = new DatabaseSync(join(source, 'vdex.db'));
  try {
    db.exec('PRAGMA foreign_keys=ON');
    migrate(db);
    createDeck(db, 'Legacy');
    db.exec('DROP INDEX decks_name_unique; PRAGMA user_version=4');
    await createBackup(db, archive, source);
    restoreBackup(archive, target);
    const restored = new DatabaseSync(join(target, 'vdex.db'));
    try {
      assert.equal(
        (restored.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,
        4,
      );
      migrate(restored);
      assert.equal(
        (restored.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,
        5,
      );
      assert.equal((restored.prepare('SELECT name FROM decks').get() as {name:string}).name, 'Legacy');
    } finally { restored.close(); }
  } finally { db.close(); rmSync(root,{recursive:true,force:true}); }
});
