import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Historical migrations are immutable and applied in version order.
 * Keep DDL in .sql files; transaction boundaries and schema version belong here.
 */
const MIGRATIONS = [
  new URL('./migrations/001_initial.sql', import.meta.url),
  new URL('./migrations/002_fsrs.sql', import.meta.url),
  new URL('./migrations/003_study_sessions.sql', import.meta.url),
  new URL('./migrations/004_notes.sql', import.meta.url)
] as const;

export function migrate(db: DatabaseSync): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (current > MIGRATIONS.length) {
    throw new Error('Database was created by a newer version of Vutadex.');
  }

  for (let version = current + 1; version <= MIGRATIONS.length; version++) {
    // Read before beginning a write transaction so missing packaged files fail cleanly.
    const sql = readFileSync(MIGRATIONS[version - 1]!, 'utf8');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      db.exec('PRAGMA user_version = ' + version);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
