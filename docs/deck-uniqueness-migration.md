# Deck-name uniqueness migration (schema v5)

Vutadex previously checked duplicate deck names in services/decks.ts using a
SELECT before INSERT/UPDATE. Separate SQLite writers could both observe an
available name before one committed. Schema v5 adds:

    CREATE UNIQUE INDEX IF NOT EXISTS decks_name_unique
      ON decks(name COLLATE NOCASE);

This makes SQLite enforce the same ASCII case-insensitive comparison as
database/query/decks/find-by-name.sql. The preflight SELECT remains as a
friendly error; it is no longer the only protection. If a race is detected by
the index, the service translates the SQLite duplicate-key error into
DeckError.

## Safe upgrade and rollback

- The migration runs inside the existing BEGIN IMMEDIATE/COMMIT transaction.
- An old database with names colliding under SQLite NOCASE fails the index
  creation. Its schema remains v4 and *no duplicates are automatically renamed
  or deleted*. Back up the database, inspect duplicates, and resolve names
  deliberately before retrying.
- The importer/backup restore still accepts v4 archives. A restored v4
  database upgrades on first normal application open.
- Foreign keys remain enabled by the normal database factory. Direct SQL
  users remain responsible for their own connection configuration.
- The v5 index prevents *new* case-insensitive duplicates; it cannot
  retroactively establish clean history without passing the migration.

Relevant tests: test/deck-uniqueness.test.ts, test/regression-upgrades.test.ts,
test/backup.test.ts, plus existing test/decks.test.ts.

This is a database-enforced invariant, **not** a formal proof of the entire
Vutadex program. Type checks, SQL constraints, and test evidence are distinct.
