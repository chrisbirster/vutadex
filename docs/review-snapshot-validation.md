# Validating persisted FSRS state

Stored SQLite rows and saved JSON snapshots are untrusted runtime data,
regardless of TypeScript annotations.

Previously services/reviews.ts returned rows through unchecked casts, and undo
restored before_json with JSON.parse(... ) as Schedule. A malformed snapshot
could be written back during a transaction.

The application now validates state at the persistence boundary, including:
- state object with finite stability, fast stability, and difficulty in
  the documented FSRS ranges;
- a positive safe-integer reviewCount;
- valid round-trip ISO timestamps for the last review and due date;
- valid JSON shape when decoding review history.

Invalid values raise ReviewError. A failed undo or review rolls back its
transaction, rather than copying malformed persisted data into the schedule.

This is **runtime** integrity enforcement, not mathematical verification of
FSRS or a reason to skip testing. The SQL schema should eventually enforce
as many of these invariants as practical, and a separate follow-up should
test recovery of old or manually modified persisted data.

No database schema or FSRS formula changes are made here.
