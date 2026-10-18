# Vutadex roadmap

Status: M0 released to main (#15), branch rules active. M1 implementation in progress; M2–M7 pending. A milestone is complete only after its acceptance tests pass and its release PR is approved.

## M0 — Foundation
- [x] Native TypeScript CLI, SQLite, basic test harness.
- [x] Separate CLI, database, and path modules.
- [x] Untrack committed `node_modules`.
- [x] Add CI for `dev` and `main` on macOS, Windows, Linux.
- [x] Add TypeScript type checks and SQLite schema version migration.
- [x] Contributing and branch-flow docs.
- [x] Initial foundation PR #13 merged into dev with all three OS checks green.
- [x] Lightweight TypeScript-only lint/format scripts added in a feature PR (pending checks and merge).
- [ ] Final M0 quality gate CI and release PR reviewed.
- [ ] Branch rules requiring CI and reviews configured by repository owner (see docs/quality-gates.md).

## M1 — Decks
- [x] Create/list/show/rename/delete deck commands.\n- [x] Descriptions and clear-description command.\n- [x] Case-insensitive duplicate-name validation and ID validation.\n- [x] Interactive deletion confirmation and explicit --yes automation override.\n- [x] TypeScript unit and CLI tests.\n- [ ] PR CI green and milestone release to main.

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
