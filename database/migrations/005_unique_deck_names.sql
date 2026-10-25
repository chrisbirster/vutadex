-- Enforce the same ASCII case-insensitive equality as the name lookup query.
-- If an existing v4 database has duplicates, SQLite rejects this index and
-- the migration transaction rolls back without modifying those decks.
CREATE UNIQUE INDEX IF NOT EXISTS decks_name_unique ON decks(name COLLATE NOCASE);
