# Vutadex roadmap

Status: M0 released (#15); M1 released (#18); M2 implemented in dev (#20), pending M2 release. M3–M7 pending.

## M0 — Foundation
- [x] Native TypeScript CLI, SQLite, basic test harness.
- [x] Separate CLI, database, and path modules.
- [x] Untrack committed `node_modules`.
- [x] Add CI for `dev` and `main` on macOS, Windows, Linux.
- [x] Add TypeScript type checks and SQLite schema version migration.
- [x] Contributing and branch-flow docs.
- [x] Initial foundation PR #13 merged into dev with all three OS checks green.
- [x] Lightweight TypeScript-only lint/format scripts added in a feature PR (pending checks and merge).
- [x] M0 quality gate CI and release PR #15 completed.
- [x] Branch rules require CI and PRs; 0 mandatory approvals (see docs/quality-gates.md).

## M1 — Decks
- [x] Create/list/show/rename/delete deck commands.
- [x] Descriptions and clear-description command.
- [x] Case-insensitive duplicate-name validation and ID validation.
- [x] Interactive deletion confirmation and explicit --yes automation override.
- [x] TypeScript unit and CLI tests.
- [x] M1 feature PR #16 passed Ubuntu/macOS/Windows CI and merged to dev.
- [x] M1 released to main in #18.

## M2 — Cards
- [x] Add/edit/list/show/delete, multiline prompts, search, validation, service and CLI tests.
- [x] M2 implementation PR #20 merged to dev, Linux/macOS/Windows CI green.\n- [ ] M2 release PR merged to main.

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
