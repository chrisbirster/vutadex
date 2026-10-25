# Review/undo state-machine testing

The deterministic test in `test/review-state-machine.test.ts` runs eight
reproducible 48-step histories (384 generated review/undo attempts) through
the *real* TypeScript review service and in-memory SQLite persistence.

An independent in-test stack represents active review snapshots. After every
operation, the test checks:
- the persisted schedule equals the expected active snapshot (or null);
- the history contains exactly the committed review and undo events;
- undo restores the previous schedule, including review count;
- the stored FSRS state remains finite and inside implemented bounds;
- review time cannot travel backward without rolling back schedule/history;
- retrievability for a valid persisted state stays in [0, 1].

This provides regression evidence across more sequences than fixed examples,
but it is **not** mathematical proof and does not verify memory-model
accuracy. Its generated clock is monotone, one process is used, and it does
not inject database crashes. Those are future independent obligations.

The test is additive: no production code or database migration changes.
