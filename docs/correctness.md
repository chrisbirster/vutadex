# Correctness by construction in Vutadex

Vutadex has **one production implementation**, in TypeScript. Separately proving
a Dafny model cannot establish that the TypeScript/SQLite implementation agrees
with it. The former draft PR #63 was closed in favor of TypeScript-first work.

## What is guaranteed and what is not

- Strict TypeScript checking catches invalid programmer calls when their types
  are known. Types vanish during compilation; any, casts, and untrusted inputs
  can bypass them.
- CLI, saved database records, imported files, and any future HTTP requests
  must be validated at runtime. They do not exist at build time.
- SQLite transactions make operations atomic. Database constraints, not
  transactions alone, establish persistent uniqueness and foreign key rules.
- Property-based and integration tests give *evidence*, not formal proofs.
- Design-by-contract runtime assertions are not a theorem prover. The helper
  in utils/contract.ts does not claim to verify all program executions.

## Typed contract experiment

Explore existing TypeScript libraries before adding more dependencies:
- gustave: mature API surface for requires/ensures/old and testing, but first
  published recently; evaluate dependency risk and runtime overhead.
- Valibot: schema parsing and inferred types, but no postcondition proofs.
- ts-code-contracts: small pre/postcondition assertion helpers.
- typesugar/contracts: experimental compiler integration and proof attempts.

To minimize production dependencies, this branch adds an intentionally small
pure-function experiment in utils/contract.ts and test/contract.test.ts.

Example:

    import { contract, finiteNumbers } from '../utils/contract.ts';

    const clamp = contract({
      input: finiteNumbers(3),
      requires: ([, min, max]) => min <= max,
      execute: ([value, min, max]) => {
        if (value < min) return min;
        if (value > max) return max;
        return value;
      },
      ensures: (result, [, min, max]) => result >= min && result <= max,
    });

    clamp(5, 0, 10);

This protects against NaN/Infinity and a reversed range. With a literal arity
such as 3, TypeScript also checks the number of arguments in source calls.
But neither the TypeScript compiler nor this helper proves the result bounded.

Input parsing and requires ALWAYS run, including in production. Ensures run
by default in test/development and can be explicitly enabled; they are skipped
by default under NODE_ENV=production to reduce per-call overhead. Do not rely
on postconditions for validation, security, correctness, or rollback of effects.

Do not wrap hot FSRS loops, SQLite commits, or effectful routines in this
helper without profiling and a separate transaction-aware design. A failing
postcondition after a database write cannot undo that write.

## Risk-driven next changes

1. Enforce case-insensitive deck-name uniqueness in a backwards-compatible
   versioned SQLite migration, with duplicate-safe failure and restore tests.
2. Validate untrusted persisted scheduling and review-history JSON; an
   unchecked TypeScript cast is not validation.
3. Make post-review and undo transitions preserve transaction invariants;
   test fault injection and concurrent writers.
4. Validate API requests once at the boundary; share typed domain operations
   between CLI and future REST handlers.
5. Add generative tests for deck/card/review sequences and migration recovery.
6. Introduce additional TypeScript strict compiler options incrementally,
   only after checking all diagnostics and behavior.
7. Track evidence (typechecked, enforced by SQLite, tested, formally proved)
   separately, rather than claiming an invented correctness percentage.

Run npm run check, npm run test:coverage, npm run build and packaged smoke
checks. A successful build is necessary, but not sufficient for correctness.
