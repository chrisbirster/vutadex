import type { DatabaseSync } from 'node:sqlite';
import { listMigrations as walkMigrationsDirectory, loadMigration, loadQuery, queryOne } from './sql.ts';

const USER_VERSION_SQL = loadQuery('schema/user-version.sql');

type UserVersion = {
  user_version: number;
}

function readVersion(db: DatabaseSync): number {
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
      db.exec(loadMigration(migrationFiles[index]!));
      // PRAGMA cannot take bound parameters; `version` is a loop counter, never user input.
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export function migrate(db: DatabaseSync): void {
  const migrationFilesFound = walkMigrationsDirectory();
  const currentMigrationVersion = checkCurrentMigrationVersion(db, migrationFilesFound);
  applyMigrations(db, currentMigrationVersion, migrationFilesFound)
}
