# Vutadex roadmap

M0 released to main (#15); M1 released (#18); M2 released (#22); M3 released (#29).
M4 interactive study sessions implemented in dev (#30, #31), final acceptance and release pending.
Feature branches target dev; milestone release PRs merge dev into main after required CI.

## M0 — Foundation
- [x] Node 26 TypeScript CLI, SQLite, modularization, strict type checks, tests and CI.
- [x] Released to main (#15).

## M1 — Deck Management
- [x] CRUD, descriptions, validation, confirmations and tests.
- [x] Released to main (#18).

## M2 — Card Management
- [x] CRUD, multiline content, search and tests.
- [x] Released to main (#22).

## M3 — FSRS-7 Scheduling
- [x] TypeScript engine, golden-vector parity, 34 parameters, SQLite v2 state/history and due scheduling.
- [x] Released to main (#29).

## M4 — Interactive Studying
- [x] Due/new/all deck-scoped queues; configurable new/review caps.
- [x] Reveal before rating, single-key terminal shortcuts, skip/quit/undo.
- [x] Durable queue persistence, resume/restart and SQLite v3 migration.
- [x] Atomic FSRS rating and queue completion; protection from stale or duplicate review.
- [x] TypeScript unit and cross-process CLI integration tests on Ubuntu/macOS/Windows.
- [x] Feature PRs #30 and #31 merged into dev with green CI.
- [ ] M4 acceptance/release PR merged to main.

## M5 — Study Methods
Typed answers, multiple-choice, shuffle and cram without scheduling; document each method's review effects and add tests.

## M6 — Progress and Portability
Statistics, due forecast, review history and streaks, safe import/export/backup and restore tests.

## M7 — Packaging and v1.0
Installable CLI, OS verification, upgrade safety, complete docs, tagged releases, v1.0 regression.
