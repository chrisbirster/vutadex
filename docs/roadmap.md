# Vutadex roadmap

Current: M0 merged to main (#15); M1 merged to main (#18); M2 merged to main (#22).
M3 FSRS-7 implementation merged into dev (#24, #25); integration acceptance and milestone release pending.
M4–M7 pending. All milestone releases are merged from dev to main after required cross-platform CI.

## M0 — Foundation
- [x] TypeScript CLI, SQLite, CI, formatting checks, modular code, migrations, protected branches.
- [x] Released (#15).

## M1 — Deck Management
- [x] Create/list/show/rename/delete/describe decks, validation and tests.
- [x] Released (#18).

## M2 — Card Management
- [x] Add/edit/list/show/delete/search cards, multiline input, validation and tests.
- [x] Released (#22).

## M3 — FSRS-7 Scheduling
- [x] Pinned FSRS-7 reference version and its 34 default parameters.
- [x] Pure TypeScript two-trace algorithm, rating transitions, and continuous interval inversion.
- [x] Reference parity tests, including nondefault parameter sets.
- [x] SQLite schema v2, per-card schedule snapshots, append-only review and undo events.
- [x] Again/Hard/Good/Easy review, due query, history and undo CLI.
- [x] Deterministic service tests and CLI cross-process integration test.
- [ ] Final acceptance CI and milestone release PR merged to main.

## M4 — Study Sessions
Interactive due-card sessions, reveal/rate, limits, keyboard navigation, resume, integration tests.

## M5 — Study Methods
Typing, multiple choice, shuffle, cram; explicit scheduling effects; tests.

## M6 — Progress and backup
Stats, due forecast, retention metrics, export/import, restore and round-trip tests.

## M7 — Distribution
Installable package, OS validation, migration safety, docs, tagged releases, v1.0 acceptance.
