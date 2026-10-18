import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

const migrations = [
  '001_initial.sql',
  '002_fsrs.sql',
  '003_study_sessions.sql',
  '004_notes.sql',
];

type UserVersion = {
  user_version: number;
}

function readVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as UserVersion;
  return row.user_version || 0;
}

export function migrate(db: DatabaseSync): void {
  const currentMigrationVersion = readVersion(db);

  if (currentMigrationVersion > migrations.length) {
    throw new Error(
      'Database was created by a newer version of Vutadex.',
    );
  }

  for (let index = currentMigrationVersion; index < migrations.length; index++) {
    const version = index + 1;
    const filename = migrations[index];

    const sql = readFileSync(
      new URL(`./migrations/${filename}`, import.meta.url),
      'utf8',
    );

    db.exec('BEGIN IMMEDIATE');
    try {
      // Re-check under the write lock; another process may have applied this migration already.
      if (currentMigrationVersion >= version) {
        db.exec('ROLLBACK');
        continue;
      }
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
