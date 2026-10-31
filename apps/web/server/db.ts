import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const path = resolve(process.env.VUTADEX_DB || './data/vutadex-web.db');
mkdirSync(dirname(path), { recursive: true });
export const db = new DatabaseSync(path);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
db.exec(
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS challenges (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER);" +
  "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS decks (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, UNIQUE(owner_id,name));" +
  "CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE, owner_id TEXT NOT NULL REFERENCES users(id), type TEXT NOT NULL, front TEXT NOT NULL, back TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE, deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE, owner_id TEXT NOT NULL REFERENCES users(id), variant TEXT NOT NULL, front TEXT NOT NULL, back TEXT NOT NULL, due_at INTEGER NOT NULL, stability REAL, difficulty REAL, fast_stability REAL, last_review_at INTEGER, review_count INTEGER NOT NULL DEFAULT 0);" +
  "CREATE TABLE IF NOT EXISTS review_events (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), card_id TEXT NOT NULL REFERENCES cards(id), rating INTEGER NOT NULL, created_at INTEGER NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS study_sessions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), queue_json TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);" +
  "CREATE INDEX IF NOT EXISTS cards_due ON cards(owner_id,due_at);" +
  "CREATE INDEX IF NOT EXISTS reviews_owner ON review_events(owner_id,created_at);"
);
export function transaction<T>(work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

db.exec("CREATE TABLE IF NOT EXISTS auth_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);");
db.exec("CREATE INDEX IF NOT EXISTS challenges_email ON challenges(email,expires_at);");
