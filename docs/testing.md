# Testing and coverage

Vutadex uses the native Node 26 TypeScript test runner and V8 coverage.

## Commands

- `npm ci`
- `npm test` — all unit, CLI integration and regression tests
- `npm run test:coverage` — source-only coverage with never-loaded files included
- `npm run check` — typecheck, lint and tests

The coverage command includes application modules in `commands/`, `database/`, `fsrs/`, `services/`, `utils/` and the CLI entry point. The test code itself is **not** counted toward production coverage. The `--test-coverage-include-all` switch keeps unimported source files from disappearing from the denominator.

## CI quality gate

The current measured minimum is **95% line coverage, 90% branch coverage, and 100% function coverage**, checked on Ubuntu, macOS and Windows. These are **coverage floors, not a claim of total 100% coverage**. The stated long-term goal is 100% for all three metrics without excluding production source paths. Do not raise thresholds before the new tests pass independently on all OS runners.

## Suites

- `test/unit-boundaries.test.ts`: FSRS invalid inputs, note schemas, media geometry, data invariants, transaction rollback and schema error paths.
- `test/media-service.test.ts`: image formats, hashing, deduplication, size limits and corruption checks.
- `test/study-input-keyboard.test.ts`: simulated keyboard streams and input cleanup.
- `test/paths-platform.test.ts`: environment directory selection on three operating systems.
- `test/integration-workflows.test.ts`: multi-command deck/card/note/study/media lifecycle, real SQLite storage and error handling.
- `test/cli-errors-integration.test.ts`: invalid argument matrix across CLI commands.
- `test/regression-upgrades.test.ts`: persisted v1/v2/v3 → v4 upgrades, future schema refusal, history and queue preservation.
- Existing FSRS golden vectors, note generation, study and CLI acceptance suites remain.

Integration and regression tests use temporary user homes and subprocesses. No network, real user profile or production DB is required.

## Next remaining coverage work

- Fully simulated interactive line-oriented confirmations and card-entry flows without relying on a real terminal in CI.
- Less common command handler and catch branches, including filesystem failures and deliberate fault injection.
- Numerical corner cases and fault recovery branches still below 100% branch coverage.

Do not use coverage-ignore pragmas merely to make an uncovered path disappear. Keep failing tests and coverage gaps visible until they are resolved.
