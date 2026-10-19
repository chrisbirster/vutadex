# SQLite migration files

Schema DDL is stored in immutable, versioned SQL scripts:

- `database/migrations/001_initial.sql`: schema version 1
- `database/migrations/002_fsrs.sql`: schema version 2
- `database/migrations/003_study_sessions.sql`: schema version 3
- `database/migrations/004_notes.sql`: schema version 4

`database/schema.ts` uses SQLite `PRAGMA user_version` to apply each outstanding script in ascending order. Each script executes within its own `BEGIN IMMEDIATE` transaction, then the runner sets `user_version` and commits atomically. Failures roll back DDL and version changes. Databases created with schema versions newer than this executable supports are rejected.

**Never rewrite released scripts.** A new schema change must add `005_*.sql` and append that file to the ordered TypeScript manifest. SQL scripts must not include `BEGIN`, `COMMIT`, `ROLLBACK`, or `PRAGMA user_version`.

The four scripts in this refactor are extracted directly from previously released inline migrations, with schema-version statements moved into the runner. Existing SQLite databases are upgraded in place; no reset or data migration is required.

## Packaging

The runtime reads SQL using `new URL(..., import.meta.url)`. Any packaged installation must preserve the `database/migrations/` directory relative to `database/schema.ts`. The M7 distribution milestone must test this explicitly.

## Verification

`test/sql-migrations.test.ts` verifies object creation, every starting user version (0–4), preservation of cards and FSRS history, note/card identity, rollback on DDL conflict, and safe retry. Existing cross-process CLI upgrade/regression tests continue to run on Ubuntu, macOS and Windows.
