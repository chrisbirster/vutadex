# Simulation contract

A VutaDex result must be reproducible from:

```text
initial state + engine version + seed + play calls + validated player inputs
```

The server is authoritative. Browsers submit intentions; they never submit outcomes.

## Game state

State contains quarter, clock, possession, down, distance, field position, score and play sequence. Every play consumes one state and emits the next state plus meaningful events.

## Determinism

The engine uses an explicit PRNG rather than package-global randomness. A persisted game records its seed and engine version. Simulation changes that would alter historical replays require a new engine version.

## Replay storage

Persist play calls and semantic events such as snap, pressure, throw, completion, tackle, turnover and scoring. Do not persist a 20–60 Hz animation stream. The UI interpolates movement from the semantic timeline.

## Tests

Every engine feature should add fixed-seed golden/property tests for invariants: games terminate, clocks do not become negative, scores are legal, possession is valid, and the same inputs produce the same result.
