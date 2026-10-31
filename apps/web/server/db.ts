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

function addColumn(table:'notes'|'cards'|'review_events'|'study_sessions',name:string,declaration:string):void{
  const cols=db.prepare('PRAGMA table_info('+table+')').all() as {name:string}[];
  if(!cols.some(c=>c.name===name))db.exec('ALTER TABLE '+table+' ADD COLUMN '+declaration);
}
addColumn('notes','revision','revision INTEGER NOT NULL DEFAULT 0');
addColumn('cards','retired','retired INTEGER NOT NULL DEFAULT 0');

addColumn('review_events','undone_at','undone_at INTEGER');
addColumn('study_sessions','status',"status TEXT NOT NULL DEFAULT 'active'");
db.exec(
  "CREATE TABLE IF NOT EXISTS user_preferences (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, timezone TEXT NOT NULL DEFAULT 'UTC');"+
  "CREATE TABLE IF NOT EXISTS review_undo (event_id TEXT PRIMARY KEY REFERENCES review_events(id), owner_id TEXT NOT NULL REFERENCES users(id), session_id TEXT NOT NULL REFERENCES study_sessions(id), card_id TEXT NOT NULL REFERENCES cards(id), before_json TEXT NOT NULL, queue_json TEXT NOT NULL, position INTEGER NOT NULL, after_revision INTEGER NOT NULL, created_at INTEGER NOT NULL, undone_at INTEGER);"+
  "CREATE INDEX IF NOT EXISTS review_undo_session ON review_undo(owner_id,session_id,created_at);"
);

db.exec(
  "CREATE TABLE IF NOT EXISTS account_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, resource TEXT NOT NULL, resource_id TEXT NOT NULL, created_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS account_changes_owner_seq ON account_changes(owner_id,seq);"
);

db.exec("CREATE TABLE IF NOT EXISTS account_drafts (owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, draft_key TEXT NOT NULL, payload_json TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(owner_id,draft_key));");

addColumn('notes','fields_json',"fields_json TEXT");

db.exec("CREATE TABLE IF NOT EXISTS media_blobs (owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, sha256 TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(owner_id,sha256));");
