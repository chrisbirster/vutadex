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
