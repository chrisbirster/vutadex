import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync, SQLInputValue, StatementResultingChanges } from 'node:sqlite';

/**
* Reads a query file from database/query/,
* e.g. loadQuery('decks/get.sql').
*/
export function loadQuery(filename: string): string {
  return readFileSync(new URL(`./query/${filename}`, import.meta.url), 'utf8');
}

/**
* Reads a migration script from database/migrations/,
* e.g. loadMigration('001_initial.sql').
*/
export function loadMigration(filename: string): string {
  return readFileSync(new URL(`./migrations/${filename}`, import.meta.url), 'utf8');
}

const MIGRATION_FILE = /^(\d+)_.+\.sql$/;

/**
* Lists migration filenames in version order, e.g. ['001_initial.sql', '002_fsrs.sql'].
* Throws on a gap or duplicate in the numbering, because migrate() treats a file's
* position as its schema version. Files that do not match NNN_name.sql are ignored.
*/
export function listMigrations(directory = fileURLToPath(new URL('./migrations/', import.meta.url))): string[] {
  const found = readdirSync(directory)
    .map(name => ({ name, version: Number(MIGRATION_FILE.exec(name)?.[1]) }))
    .filter(file => MIGRATION_FILE.test(file.name))
    .sort((a, b) => a.version - b.version);
  found.forEach((file, index) => {
    if (file.version !== index + 1) {
      throw new Error(`Migration ${file.name} is out of sequence; expected version ${index + 1}.`);
    }
  });
  return found.map(file => file.name);
}

/**
* First row, or undefined. `T` is the caller's claim about the row shape;
* it is not checked at runtime.
*/
export function queryOne<T>(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

/**
* All rows. `T` is the caller's claim about the row shape;
* it is not checked at runtime.
*/
export function queryAll<T>(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

/**
* Runs an INSERT, UPDATE or DELETE and returns `changes` and `lastInsertRowid`. */
export function execute(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): StatementResultingChanges {
  return db.prepare(sql).run(...params);
}
