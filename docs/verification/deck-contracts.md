# Formal verification lab: deck management

**Status (2026-10-24): first executable proof candidate added; Dafny verifier has not yet been run.**
This is an educational, deliberately narrow correctness exercise. It does not certify Vutadex,
and it does not change any production behavior.

## Goal and proof boundary

Treat a deck operation as a state transition, not just a function call.
Let S be a mapping from deck ID to a deck record. Define I(S) to mean:

1. Each deck ID is positive.
2. Each deck has a valid name and optional valid description.
3. No two distinct decks share the same *canonical* name.
4. The deck's creation time and card membership are part of its state.

A correct successful transition must preserve I(S). A rejected operation should leave
persisted state unchanged. Initial state validity and transition preservation together give
an inductive argument for validity of all reachable states, **provided every mutation goes
through verified/enforced transitions**.

### Contracts for Vutadex's existing deck commands

| Operation | Preconditions | Expected successful effect | Failure behavior |
| --- | --- | --- | --- |
| list | database available | return decks sorted by name (NOCASE), then ID | no writes |
| create | validated, unique name; description valid | add exactly one deck with a fresh ID, no cards | no partial deck |
| show | ID exists | return that deck and its live card count | no writes |
| rename | ID exists; name valid and not owned by another deck | update only the name; preserve ID, description, timestamp, cards, other decks | no writes |
| describe | ID exists; description valid or cleared | update only the description | no writes |
| delete | ID exists; confirmation accepted | remove deck, cascade owned cards per schema | no writes on rejection |
| import | valid supported content and media | create the complete new deck and notes/cards atomically | no partial import |
| export | ID exists; all content exportable | produce a valid content-only .deck v2 stream | no database writes |

These are *intended contracts*, not statements that every part has been formally proved.
Import/export need additional specifications for their file format, filesystem effects,
FSRS history exclusions, and media.

## First machine-checkable candidate: rename

See [verification/deck-rename.dfy](../../verification/deck-rename.dfy).

The Dafny model uses:
- immutable finite maps from positive integer IDs to deck records;
- a logical card-ID set embedded in each deck to express preservation;
- a canonical-name key to represent case-insensitive uniqueness;
- preconditions requiring a valid initial state, existing ID, validated name, and no collision;
- postconditions saying every unaffected field and every other deck remains identical,
  and the resulting state still satisfies the invariant.

The model's simple string-length predicate is only an *abstraction*. Production name
validation trims whitespace, excludes ASCII control characters, and counts UTF-16
code units, whereas Dafny uses a different string representation. The canonical-name
key is supplied by the environment, not computed or verified inside Dafny.
The proof therefore **assumes** correct input validation and canonicalization; it
does not establish those facts.

Dafny proofs are conditional on their stated preconditions. A call with an invalid
name or nonexistent ID is outside the success proof; the real program must reject it
without modifying data.

## How to run

Install Dafny from its official instructions, then from the repository root:

    dafny verify verification/deck-rename.dfy

Also run Vutadex's existing Node 26 checks:

    npm ci
    npm run check
    npm test

No assertion of successful formal verification is made until a successful verifier
run is recorded. The tests in test/deck-rename-invariants.test.ts inspect actual
SQLite behavior; they **do not** turn the Dafny model into a proof of TypeScript.

## Known gaps / proof obligations

1. **Model-to-code refinement.** Demonstrate that TypeScript/SQLite rename implements
   the same atomic transition as the model. A model proof alone is insufficient.
2. **Database uniqueness.** services/decks.ts checks for a duplicate name in application
   code, but database/migrations/001_initial.sql does not enforce uniqueness. Concurrent
   writers can race. Introduce a versioned, duplicate-aware unique-index migration in
   its own PR; do not silently change older saved databases.
3. **Canonical names.** Define an exact correspondence to SQLite COLLATE NOCASE,
   including its ASCII-only behavior and edge cases, before proving uniqueness end-to-end.
4. **Validation.** Reconcile UTF-16 length, trimmed whitespace, control-character rules,
   and persisted data with the model's simplified predicates.
5. **Other transitions.** Add independently checked Create, Describe, Delete, and
   read-only List/Show specifications; model card and review-history cascades for Delete.
6. **Failures and crashes.** Test/verify rollback, errors, multi-process contention,
   and file-system failures at the implementation boundary.
7. **Trusted base.** The verifier, compiler, SQLite engine, OS, filesystem, and
   code-to-model correspondence are assumptions unless separately established.

## Learning sequence

1. Read the Dafny Rename preconditions and postconditions.
2. Change the body so it accidentally overwrites the description. Verification should fail.
3. Restore the body and check that the verifier accepts it.
4. Run the SQLite invariants test. Observe the difference between a verified *model*
   and experimentally validated *implementation behavior*.
5. Only then extend the model to Create, Describe, and Delete.

Do not remove runtime validation at external boundaries simply because a pure
function has been verified; the proof begins **after** its preconditions hold.
