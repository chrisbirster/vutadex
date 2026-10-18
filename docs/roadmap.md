# Vutadex roadmap

M0–M4 released to main (#15, #18, #22, #29, #33).
M5 Plandalf-style note types implemented in dev (#35–#38), with acceptance and release pending.
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
- [ ] Final acceptance CI and M5 release to main.

## M6 — Progress and Portability
Stats, forecasts, export/import including Plandalf .deck v2, durable media portability, safe backup/restore, round-trip tests.

## M7 — Distribution
Installable CLI, complete OS verification, release tagging, migration safety, v1.0 documentation.
