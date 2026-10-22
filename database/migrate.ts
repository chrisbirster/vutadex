import type { DatabaseSync } from 'node:sqlite';
import { listMigrationFiles, loadMigrationByFilename, loadQueryByFilename, queryOne } from './sql.ts';
import type { UserVersion } from '../models/schema.ts';

const USER_VERSION_SQL = loadQueryByFilename('schema/user-version.sql');

export function readVersion(db: DatabaseSync): number {
  return queryOne<UserVersion>(db, USER_VERSION_SQL)?.user_version ?? 0;
}

function checkCurrentMigrationVersion(db: DatabaseSync, migrationFiles: string[]): number {
  const currentMigrationVersion = readVersion(db);
  if (currentMigrationVersion > migrationFiles.length) {
    throw new Error(
      'Database was created by a newer version of Vutadex.',
    );
  }
  return currentMigrationVersion;
}

function applyMigrations(db: DatabaseSync, currentMigrationVersion: number, migrationFiles: string[]) {
  for (let index = currentMigrationVersion; index < migrationFiles.length; index++) {
    const version = index + 1;
    db.exec('BEGIN IMMEDIATE');
    try {
      // Re-check under the write lock; another process may have applied this migration already.
      if (readVersion(db) >= version) {
        db.exec('ROLLBACK');
        continue;
      }
      db.exec(loadMigrationByFilename(migrationFiles[index]!));
      // PRAGMA cannot take bound parameters; `version` is a loop counter, never user input.
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** The schema version a fully migrated database has: one per migration file. */
export function latestVersion(): number {
  return listMigrationFiles().length;
}

export function migrate(db: DatabaseSync): void {
  const migrationFilesFound = listMigrationFiles();
  const currentMigrationVersion = checkCurrentMigrationVersion(db, migrationFilesFound);
  applyMigrations(db, currentMigrationVersion, migrationFilesFound)
}
