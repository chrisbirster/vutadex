import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Storage layer for the Vutadex web server.
//
// Owner decision (2026-11-01): the hosted web app uses Turso; local SQLite
// (node:sqlite) stays for testing and the CLI app. Backend selection:
//   - TURSO_DATABASE_URL set   -> @libsql/client (libsql:// remote, or file: for
//                                 hermetic local tests without any network).
//   - otherwise                -> node:sqlite DatabaseSync at VUTADEX_DB
//                                 (default ./data/vutadex-web.db), today's behavior.
//
// Foreign-key integrity: node:sqlite enforces FK via PRAGMA foreign_keys=ON on
// its single persistent connection. @libsql/client (0.18.x) rotates its remote
// WebSocket session every ~60s (maxConnAgeMillis) with no setup hook, and Turso
// exposes no server-side FK config knob, so remote FK enforcement is NOT relied
// upon (pragma applied best-effort only for file: URLs). No current API path
// deletes a cascaded parent row; any future endpoint that deletes decks/notes/
// users MUST use explicit dependency-ordered deletes inside one transaction
// instead of relying on ON DELETE CASCADE.

export type SqlArg = string | number | null | Uint8Array;

export interface SqlStorage {
  query<T>(sql: string, ...args: SqlArg[]): Promise<T | undefined>;
  list<T>(sql: string, ...args: SqlArg[]): Promise<T[]>;
  run(sql: string, ...args: SqlArg[]): Promise<{ changes: number }>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
  close(): void;
}

const txContext = new AsyncLocalStorage<SqlStorage>();
let txQueue: Promise<unknown> = Promise.resolve();

const tursoUrl = process.env.TURSO_DATABASE_URL;

async function createNodeSqliteStorage(): Promise<SqlStorage> {
  const { DatabaseSync } = await import('node:sqlite');
  const path = resolve(process.env.VUTADEX_DB || './data/vutadex-web.db');
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const base: SqlStorage = {
    async query<T>(sql: string, ...args: SqlArg[]): Promise<T | undefined> {
      return db.prepare(sql).get(...args) as T | undefined;
    },
    async list<T>(sql: string, ...args: SqlArg[]): Promise<T[]> {
      return db.prepare(sql).all(...args) as T[];
    },
    async run(sql: string, ...args: SqlArg[]): Promise<{ changes: number }> {
      const result = db.prepare(sql).run(...args);
      return { changes: Number(result.changes) };
    },
    close(): void { db.close(); },
    async transaction<T>(work: () => Promise<T>): Promise<T> {
      // Serialize transactions on this single connection: async work() suspends
      // on the microtask queue between statements, so without a queue two
      // concurrent transactions would both issue BEGIN on the same connection.
      // Once a transaction holds the queue, its statements still complete within
      // microtask draining (the driver is synchronous), so no other request's
      // statement can interleave into it.
      const run = txQueue.then(async (): Promise<T> => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = await txContext.run(txOnly(base), work);
          db.exec('COMMIT');
          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      });
      txQueue = run.catch(() => undefined);
      return run;
    },
  };
  return base;
}

async function createLibsqlStorage(url: string): Promise<SqlStorage> {
  const { createClient } = await import('@libsql/client');
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  if (url.startsWith('file:')) {
    // Local file backend (tests / local dev): one persistent connection, so the
    // pragma holds. For remote libsql:// this is intentionally NOT done: the
    // client rotates sessions every ~60s and pragma state would silently lapse.
    await client.execute('PRAGMA foreign_keys = ON');
    await client.execute('PRAGMA busy_timeout = 5000');
  }
  // SQLite is single-writer. The libsql client (local file or remote) does not
  // queue concurrent writes or write-transactions for us: overlapping ones fail
  // with SQLITE_BUSY. Serialize every write through one FIFO queue so concurrent
  // request handlers behave the same on both backends. Reads stay parallel.
  let writeQueue: Promise<unknown> = Promise.resolve();
  const enqueueWrite = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = writeQueue.then(fn);
    writeQueue = p.catch(() => undefined);
    return p;
  };
  // The write queue serializes base-client writes only. Statements issued on a
  // transaction connection must NOT be queued: the transaction already holds
  // the queue slot, so queueing its inner statements would self-deadlock.
  const forConn = (conn: { execute: (stmt: { sql: string; args: SqlArg[] }) => Promise<{ rows: unknown[]; rowsAffected?: number | bigint }> }, queued: boolean): Pick<SqlStorage, 'query' | 'list' | 'run'> => ({
    async query<T>(sql: string, ...args: SqlArg[]): Promise<T | undefined> {
      const result = await conn.execute({ sql, args });
      return result.rows[0] as T | undefined;
    },
    async list<T>(sql: string, ...args: SqlArg[]): Promise<T[]> {
      const result = await conn.execute({ sql, args });
      return result.rows as T[];
    },
    async run(sql: string, ...args: SqlArg[]): Promise<{ changes: number }> {
      const exec = () => conn.execute({ sql, args });
      const result = await (queued ? enqueueWrite(exec) : exec());
      return { changes: Number(result.rowsAffected ?? 0) };
    },
  });
  const base: SqlStorage = {
    ...forConn(client, true),
    close(): void { client.close(); },
    async transaction<T>(work: () => Promise<T>): Promise<T> {
      return enqueueWrite(async (): Promise<T> => {
        const tx = await client.transaction('write');
      const txStorage: SqlStorage = { ...forConn(tx, false), transaction: nestedUnsupported, close: () => {} };
        try {
          const result = await txContext.run(txStorage, work);
          await tx.commit();
          return result;
        } catch (error) {
          try { await tx.rollback(); } catch { /* already closed */ }
          throw error;
        }
      });
    },
  };
  return base;
}

async function nestedUnsupported<T>(_work: () => Promise<T>): Promise<T> {
  throw new Error('Nested transactions are not supported');
}

function txOnly(base: SqlStorage): SqlStorage {
  return { ...base, transaction: nestedUnsupported };
}

const storage: SqlStorage = tursoUrl ? await createLibsqlStorage(tursoUrl) : await createNodeSqliteStorage();

export const storageBackend = tursoUrl ? 'libsql' : 'node:sqlite';

export function query<T>(sql: string, ...args: SqlArg[]): Promise<T | undefined> {
  return (txContext.getStore() ?? storage).query<T>(sql, ...args);
}
export function list<T>(sql: string, ...args: SqlArg[]): Promise<T[]> {
  return (txContext.getStore() ?? storage).list<T>(sql, ...args);
}
export function run(sql: string, ...args: SqlArg[]): Promise<{ changes: number }> {
  return (txContext.getStore() ?? storage).run(sql, ...args);
}
export function transaction<T>(work: () => Promise<T>): Promise<T> {
  return storage.transaction(work);
}
export function closeStorage(): void {
  storage.close();
}

// --- Schema bootstrap (identical statements to the pre-Turso implementation) ---

async function bootstrap(s: SqlStorage): Promise<void> {
  const exec = async (sql: string) => { for (const stmt of sql.split(';').map(x => x.trim()).filter(Boolean)) await s.run(stmt); };
  await exec(
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

  await exec("CREATE TABLE IF NOT EXISTS auth_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);");
  await exec("CREATE INDEX IF NOT EXISTS challenges_email ON challenges(email,expires_at);");

  const addColumn = async (table: 'notes' | 'cards' | 'review_events' | 'study_sessions', name: string, declaration: string): Promise<void> => {
    const cols = await s.list<{ name: string }>('PRAGMA table_info(' + table + ')');
    if (!cols.some(c => c.name === name)) await s.run('ALTER TABLE ' + table + ' ADD COLUMN ' + declaration);
  };
  await addColumn('notes', 'revision', 'revision INTEGER NOT NULL DEFAULT 0');
  await addColumn('cards', 'retired', 'retired INTEGER NOT NULL DEFAULT 0');
  await addColumn('review_events', 'undone_at', 'undone_at INTEGER');
  await addColumn('study_sessions', 'status', "status TEXT NOT NULL DEFAULT 'active'");
  await exec(
    "CREATE TABLE IF NOT EXISTS user_preferences (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, timezone TEXT NOT NULL DEFAULT 'UTC');" +
    "CREATE TABLE IF NOT EXISTS review_undo (event_id TEXT PRIMARY KEY REFERENCES review_events(id), owner_id TEXT NOT NULL REFERENCES users(id), session_id TEXT NOT NULL REFERENCES study_sessions(id), card_id TEXT NOT NULL REFERENCES cards(id), before_json TEXT NOT NULL, queue_json TEXT NOT NULL, position INTEGER NOT NULL, after_revision INTEGER NOT NULL, created_at INTEGER NOT NULL, undone_at INTEGER);" +
    "CREATE INDEX IF NOT EXISTS review_undo_session ON review_undo(owner_id,session_id,created_at);"
  );
  await exec(
    "CREATE TABLE IF NOT EXISTS account_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, resource TEXT NOT NULL, resource_id TEXT NOT NULL, created_at INTEGER NOT NULL);" +
    "CREATE INDEX IF NOT EXISTS account_changes_owner_seq ON account_changes(owner_id,seq);"
  );
  await exec("CREATE TABLE IF NOT EXISTS account_drafts (owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, draft_key TEXT NOT NULL, payload_json TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(owner_id,draft_key));");
  await addColumn('notes', 'fields_json', "fields_json TEXT");
  await exec("CREATE TABLE IF NOT EXISTS media_blobs (owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, sha256 TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(owner_id,sha256));");
  await exec(
    "CREATE TABLE IF NOT EXISTS legacy_migrations (owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, source_id TEXT NOT NULL, checksum TEXT NOT NULL, summary_json TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(owner_id,source_id));" +
    "CREATE TABLE IF NOT EXISTS legacy_raw_events (owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, source_id TEXT NOT NULL, original_event_id INTEGER NOT NULL, mapped_card_id TEXT NOT NULL REFERENCES cards(id), raw_json TEXT NOT NULL, PRIMARY KEY(owner_id,source_id,original_event_id));"
  );
  await addColumn('review_events', 'review_count_before', 'review_count_before INTEGER');
  await addColumn('review_events', 'last_review_at_before', 'last_review_at_before INTEGER');
  await addColumn('review_events', 'due_at_before', 'due_at_before INTEGER');
  await exec("CREATE TABLE IF NOT EXISTS study_activity (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),session_id TEXT NOT NULL REFERENCES study_sessions(id),duration_ms INTEGER NOT NULL CHECK(duration_ms>0 AND duration_ms<=15000),created_at INTEGER NOT NULL);");
  await exec("CREATE INDEX IF NOT EXISTS study_activity_owner ON study_activity(owner_id,created_at);");
}

await bootstrap(storage);
