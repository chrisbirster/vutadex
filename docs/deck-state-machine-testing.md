# Deck state-machine regression test

The test in `test/deck-state-machine.test.ts` runs 12 deterministic sequences
of 90 commands each (1,080 generated operations), directly against the actual
TypeScript services and an in-memory SQLite database.

It maintains a deliberately small reference state: each deck's ID, name,
description, creation timestamp, and one associated card ID. After every
command it checks that the database matches that state.

The generated transitions exercise:
- creating decks with cards;
- renaming a deck while preserving all other fields and card ownership;
- describing or clearing a description;
- deleting a deck with an owned card and verifying cascade;
- rejecting duplicate names (under SQLite ASCII case-insensitive semantics)
  or invalid blank names without changing persisted state.

If one sequence fails, its seed and step allow deterministic reproduction.
No network, real user database, or production state is touched.

This is a model-based **test**, not a mathematical proof. It checks 1,080
selected operation paths, not all conceivable sequences or concurrency
interleavings. Follow-ups should exercise concurrent writers, crash injection,
and the more complex FSRS review/undo state machine.
