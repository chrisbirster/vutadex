# Vutadex roadmap

Status: M0 implementation proposed in feature PR; M1–M7 pending. A milestone is complete only after its acceptance tests pass and its release PR is approved.

## M0 — Foundation
- [x] Native TypeScript CLI, SQLite, basic test harness.
- [x] Separate CLI, database, and path modules.
- [x] Untrack committed `node_modules`.
- [x] Add CI for `dev` and `main` on macOS, Windows, Linux.
- [x] Add TypeScript type checks and SQLite schema version migration.
- [x] Contributing and branch-flow docs.
- [ ] PR CI verified green and release acceptance reviewed.
- [ ] Branch rules requiring CI and reviews configured by repository owner.

## M1 — Decks
Create/list/show/rename/delete, duplicate-name policy, destructive confirmation, tests.

## M2 — Cards
Add/edit/list/show/delete, multiline text, search, validation, tests.

## M3 — FSRS
Select FSRS library/version; schema for scheduling state and review history; Again/Hard/Good/Easy, transactional reviews, rollback/undo, time-zone tests.

## M4 — Study
Interactive due-card sessions, reveal/rate, limits, keyboard navigation, resume, integration tests.

## M5 — Methods
Typing, multiple choice, shuffle, cram; explicit scheduling effects; tests.

## M6 — Progress and backup
Stats, due forecast, retention metrics, export/import, restore and round-trip tests.

## M7 — Distribution
Installable package, OS validation, migration safety, docs, tagged releases, v1.0 acceptance.
