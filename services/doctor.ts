import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DB_NAME } from '../constants.ts';
import { getDatabase } from '../database/index.ts';
import { latestVersion, readVersion } from '../database/migrate.ts';
import { loadQueryByFilename, queryOne } from '../database/sql.ts';
import type { DoctorCheck } from '../models/doctor.ts';
import { getAppDirectory } from '../utils/paths.ts';

const INTEGRITY_CHECK_SQL = loadQueryByFilename('schema/integrity-check.sql');

function check(name: string, status: DoctorCheck['status'], detail: string, fix = ''): DoctorCheck {
  return { name, status, detail, fix };
}

function checkDirectory(name: string, directory: string, fix: string, createdOnDemand = false): DoctorCheck {
  if (!fs.existsSync(directory)) {
    return createdOnDemand
      ? check(name, 'ok', `${directory} (created when first needed)`)
      : check(name, 'todo', `Missing: ${directory}`, fix);
  }
  if (!fs.statSync(directory).isDirectory()) return check(name, 'problem', `Not a directory: ${directory}`);
  try {
    fs.accessSync(directory, fs.constants.W_OK);
  } catch {
    return check(name, 'problem', `Not writable: ${directory}`);
  }
  return check(name, 'ok', directory);
}

function checkDatabase(databasePath: string): DoctorCheck {
  const name = 'Database';
  const createFix = `Create ${databasePath} and apply all migrations`;
  if (!fs.existsSync(databasePath)) return check(name, 'todo', 'No database yet', createFix);
  let db: DatabaseSync | undefined;
  try {
    // Read-only, so inspecting never creates or changes anything.
    db = new DatabaseSync(databasePath, { readOnly: true });
    const integrity = queryOne<{ integrity_check: string }>(db, INTEGRITY_CHECK_SQL)?.integrity_check;
    if (integrity !== 'ok') return check(name, 'problem', `Integrity check failed: ${integrity}`);
    const current = readVersion(db);
    const latest = latestVersion();
    if (current > latest) return check(name, 'problem', 'Created by a newer version of Vutadex.');
    if (current < latest) {
      return check(name, 'todo', `Schema version ${current} of ${latest}`, `Apply ${latest - current} pending migration(s)`);
    }
    return check(name, 'ok', `Schema version ${current}, integrity ok`);
  } catch (error) {
    return check(name, 'problem', error instanceof Error ? error.message : String(error));
  } finally {
    db?.close();
  }
}

/**
 * Reports the state of the data directory, database and media directory without changing anything.
 *
 * Each check is `ok`, `todo` (setUpApp can fix it) or `problem` (needs a person).
 */
export function inspectSetup(appDirectory = getAppDirectory()): DoctorCheck[] {
  return [
    checkDirectory('Data directory', appDirectory, `Create ${appDirectory}`),
    checkDatabase(path.join(appDirectory, DB_NAME)),
    checkDirectory('Media directory', path.join(appDirectory, 'media'), '', true)
  ];
}

/**
 * Creates the data directory and brings the database up to the latest schema: the same thing
 * every command does on first run. Safe to repeat; it only fills in what is missing.
 */
export function setUpApp(appDirectory = getAppDirectory()): void {
  getDatabase(appDirectory).close();
}
