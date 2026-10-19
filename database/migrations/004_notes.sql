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
