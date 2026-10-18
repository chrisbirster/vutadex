import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { getDataHome } from '../utils/paths.ts';
import { migrate } from './schema.ts';

const APP_NAME = 'vutadex';
const DB_NAME = 'vdex.db';

export function getDatabase(): DatabaseSync {
  const directory = path.join(getDataHome(), APP_NAME);
  fs.mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, DB_NAME));
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
