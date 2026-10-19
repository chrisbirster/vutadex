# Testing and coverage

Vutadex uses Node 26's TypeScript test runner and V8 coverage, targeted at **cleanup-commands-v3** as the canonical implementation.

## Commands

- `npm ci` — install dependencies
- `npm test` — all unit, integration and regression suites
- `npm run test:coverage` — enforce 95% lines, 90% branches and 100% functions
- `npm run build` — compile the CLI and copy versioned migrations and query SQL into `dist/`
- `node --test test/packaged-cli.test.ts` — test the compiled CLI after building
- `npm run check` — typecheck, style and test suite

Coverage includes production code from root entrypoints, `commands/` (including subcommands), `services/`, `database/`, `fsrs/`, and `utils/`. Test code is excluded; `--test-coverage-include-all` includes never-imported source modules.

## Current quality gate

All three OS CI jobs must pass **95% line, 90% branch and 100% function** minimum coverage. This is a threshold, not a statement that every executable line or branch has been exercised.

On the canonical integration branch after porting the tests, the preliminary Ubuntu measurement was **98.99% lines, 92.17% branches, 100% functions**. Recheck on the latest head before publication.

## Suites

- Unit: FSRS golden/reference vectors, deck/card/note operations, selection/occlusion, scheduling, input and error boundaries, media integrity and path handling.
- Integration: real multi-process CLI operations, persistent SQLite, note/card/study workflows, command argument matrix, packaged CLI.
- Regression: schema versions 1–4 and safe upgrades, existing review history and card IDs, study queue resume, media corruption, and migration file enumeration/order.
- Interactive: deterministic test injection through `commands/terminal.ts` *without* replacing Cleanup v3's per-subcommand structure. Raw study keyboard entry is separately tested.

The test suite never relies on an existing user profile or production database.

## Remaining coverage gaps

The goal is 100% line and branch coverage; currently rare exception, usage and fault-injection branches remain. Do not suppress uncovered paths or reduce baseline CI checks to inflate percentages.
