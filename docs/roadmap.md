# Vutadex roadmap

M0–M4 released to main (#15, #18, #22, #29, #33).
M5 Plandalf-style note types released to main (#41). Cleanup v3 source-of-truth integration and test portability were promoted to main in #48; M5.6 regression hardening was merged to dev in #51.
Branches: feature/* -> dev -> main using cross-platform CI and a regular milestone release merge.

## M0 — Foundation
- [x] Node 26 TypeScript local CLI, SQLite, TypeScript tests, CI and branch rules.
- [x] Released (#15).

## M1 — Deck Management
- [x] CRUD, descriptions and input validation.
- [x] Released (#18).

## M2 — Card Management
- [x] CRUD, multiline cards, search, tests.
- [x] Released (#22).

## M3 — FSRS-7 Scheduling
- [x] Pure TypeScript 34-parameter model, reference parity, SQLite scheduling/history/undo.
- [x] Released (#29).

## M4 — Interactive Study
- [x] Due/new/all queues, single-key reveal and explicit FSRS ratings, resume/limits/undo.
- [x] Released (#33).

## M5 — Plandalf Note Types and Card Generation
- [x] SQLite v4 logical notes, fields and stable generated-card mapping.
- [x] Basic, reverse, optional reverse, cloze, typed-answer, choice, select, ordering and image-occlusion.
- [x] Typed/choice/select/ordering study prompts with explicit FSRS grades.
- [x] Local media hash storage and terminal occlusion fallback.
- [x] Note creation/editing/retirement; old card identities and FSRS history preserved.
- [x] Legacy cards remain accessible, retired generated cards hidden from due/study queues.
- [x] Unit and CLI tests for v3 migration, note identity, retirement and interactions.
- [x] Final acceptance CI and M5 release to main (#41).

## M6 — Progress and Portability
- [x] M6.1: Study statistics, review activity and UTC saved-due-date forecast (merged to dev in #52; not yet released to main).
- [ ] M6.2: .deck v2 export/import with verified format and round-trip tests (verified format/safety contract in docs/m6-deck-format.md; code pending).
- [ ] M6.3: Portable media and validated safe backup/restore.
- [ ] M6 release acceptance, CI and promotion to main as v0.6.0.

## M7 — Distribution
Installable CLI, complete OS verification, release tagging, migration safety, v1.0 documentation.
