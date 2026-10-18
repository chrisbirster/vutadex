import type { DatabaseSync } from 'node:sqlite';

export function migrate(db: DatabaseSync): void {
  const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (version.user_version > 4) {
    throw new Error('Database was created by a newer version of Vutadex.');
  }
  if (version.user_version < 1) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS decks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS cards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          deck_id INTEGER NOT NULL,
          front TEXT NOT NULL,
          back TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
        );
        PRAGMA user_version = 1;
      `);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if (version.user_version < 2) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`
        CREATE TABLE card_schedules (
          card_id INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
          stability REAL NOT NULL,
          difficulty REAL NOT NULL,
          fast_stability REAL NOT NULL,
          last_review_at TEXT NOT NULL,
          due_at TEXT NOT NULL,
          review_count INTEGER NOT NULL CHECK(review_count >= 1),
          scheduler_version TEXT NOT NULL,
          target_retention REAL NOT NULL
        );
        CREATE TABLE review_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL CHECK(event_type IN ('review', 'undo')),
          rating INTEGER CHECK(rating BETWEEN 1 AND 4),
          occurred_at TEXT NOT NULL,
          before_json TEXT,
          after_json TEXT,
          elapsed_days REAL,
          retrievability_before REAL,
          undone_review_id INTEGER REFERENCES review_events(id),
          scheduler_version TEXT NOT NULL,
          CHECK((event_type = 'review' AND rating IS NOT NULL AND undone_review_id IS NULL)
             OR (event_type = 'undo' AND rating IS NULL AND undone_review_id IS NOT NULL))
        );
        CREATE INDEX review_events_card_idx ON review_events(card_id, id);
        CREATE UNIQUE INDEX review_events_undo_unique ON review_events(undone_review_id)
          WHERE undone_review_id IS NOT NULL;
        CREATE INDEX card_schedules_due_idx ON card_schedules(due_at);
        PRAGMA user_version = 2;
      `);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if (version.user_version < 3) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`
        CREATE TABLE study_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          deck_id INTEGER REFERENCES decks(id) ON DELETE SET NULL,
          mode TEXT NOT NULL CHECK(mode IN ('due', 'new', 'all')),
          new_limit INTEGER NOT NULL CHECK(new_limit BETWEEN 0 AND 1000),
          review_limit INTEGER NOT NULL CHECK(review_limit BETWEEN 0 AND 1000),
          status TEXT NOT NULL DEFAULT 'active'
            CHECK(status IN ('active', 'completed', 'abandoned')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX study_one_active_session
          ON study_sessions(status) WHERE status = 'active';
        CREATE TABLE study_session_items (
          session_id INTEGER NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
          card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('new', 'review')),
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK(status IN ('pending', 'done', 'skipped')),
          starting_review_count INTEGER NOT NULL,
          starting_last_review_at TEXT,
          review_event_id INTEGER REFERENCES review_events(id) ON DELETE SET NULL,
          PRIMARY KEY(session_id, card_id),
          UNIQUE(session_id, position)
        );
        CREATE INDEX study_session_items_pending ON study_session_items(session_id, status, position);
        PRAGMA user_version = 3;
      `);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  if (version.user_version < 4) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`
        CREATE TABLE notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
          note_type TEXT NOT NULL,
          fields_json TEXT NOT NULL,
          tags_json TEXT NOT NULL DEFAULT '[]',
          retired INTEGER NOT NULL DEFAULT 0 CHECK(retired IN (0,1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX notes_deck_idx ON notes(deck_id, retired);
        CREATE TABLE generated_cards (
          card_id INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
          note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          generation_key TEXT NOT NULL UNIQUE,
          retired INTEGER NOT NULL DEFAULT 0 CHECK(retired IN (0,1))
        );
        CREATE INDEX generated_cards_note_idx ON generated_cards(note_id, retired);
        PRAGMA user_version = 4;
      `);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

}
