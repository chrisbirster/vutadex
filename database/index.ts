import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { getAppDirectory } from '../utils/paths.ts';
import { migrate } from './migrate.ts';
import { DB_NAME } from '../constants.ts';

/** How long a connection waits for another process's lock before giving up (two first runs at once, say). */
const BUSY_TIMEOUT_MS = 5000;

/**
 * Opens the database, creating it on first run and bringing an older one up to date.
 *
 * Users never run migrations: a new release ships its migrations and the first command after
 * upgrading applies them. When the schema is current this costs one `PRAGMA user_version` read.
 *
 * @throws {Error} If the database was created by a newer version of Vutadex.
 */
export function getDatabase(appDirectory = getAppDirectory()): DatabaseSync {
  const databasePath = path.join(appDirectory, DB_NAME);
  const isFirstRun = !fs.existsSync(databasePath);
  if (isFirstRun) fs.mkdirSync(appDirectory, { recursive: true });
  const db = new DatabaseSync(databasePath, { timeout: BUSY_TIMEOUT_MS });
  try {
    // Foreign keys are a per-connection setting. WAL is stored in the file, so once is enough.
    db.exec(isFirstRun ? 'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;' : 'PRAGMA foreign_keys = ON');
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
