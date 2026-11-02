# Turso/libSQL web backend migration — implementation checklist

**Status:** SUPERSEDED historical assessment (written 2026-11-01, before implementation). The implementation this document scoped has since landed on this branch: dual-backend storage in `124919c`, the remote-verification harness with measured results in `957740d`, and the E2E synchronization fix in `a301251`. For current measured state and exact remaining limitations see the PR #91 body and `docs/production-runbook.md`. The checklist below is preserved as the original pre-implementation record; its "NOT DONE" section was accurate when written and no longer describes this branch.

Owner decision (2026-11-01): hosted **web** data will use the newly created, empty `vutadex-web` Turso database (`libsql://vutadex-web-chrisbirster.aws-us-east-1.turso.io`; default group, AWS us-east-1). The older `vutadex` database has an incompatible marketplace/organizations schema and must remain untouched. CLI, local tests, and the three `apps/web/scripts` entrypoints continue using `node:sqlite`.

## Verified dev baseline

- Branch point: `8dd24fac0ae1f970c831396c61bf9cc76ff4d4fe`.
- `apps/web/server/db.ts` currently bootstraps the complete SQLite schema at import time and exposes a synchronous `transaction()`.
- `apps/web/server/index.ts` is built around synchronous `query()`, `list()`, `run()` and synchronously nested transaction callbacks. Changing only the database adapter would produce unawaited promises and incorrect transaction behavior.
- `apps/web/test/api.test.ts` starts its own server and directly inspects the node:sqlite test file at three assertions.
- `apps/web/package.json` uses `node --test test/*.test.ts`, so adding `api-libsql.test.ts` will be discovered by the current web check command.

## Required before this PR can claim implementation

1. Introduce `@libsql/client` (stable `0.18.0` as verified on 2026-11-01) with a regenerated root npm lockfile. Validate `npm ci` in Node 26 and supported CI environments.
2. Build the backend selector and async storage interface. Keep the existing schema statements and additive migrations. Preserve FK declarations and enforce PRAGMA foreign_keys=ON on startup for node:sqlite. For libSQL, apply the pragma only once at startup as best-effort: the @libsql/client 0.18.0 remote WebSocket rotates after 60 seconds and can reconnect without a SQL setup hook, so remote FK enforcement cannot be client-managed and must not be relied upon. Existing API DELETEs touch only challenges, sessions, account_drafts and orphan media_blobs; no cascaded parent is deleted today. Any future deck/note/user delete endpoint MUST use explicit dependency-ordered deletes in a transaction rather than rely on remote cascades. Keep local-only WAL/busy timeout, correct Uint8Array BLOB representation, and explicit failure when a remote URL lacks required credentials.
3. Scope libSQL operations to an ALS transaction context; for node:sqlite protect against concurrency/interleaving between async transactions. Verify BEGIN IMMEDIATE, commit, rollback, constraint enforcement, and non-transaction traffic semantics.
4. Propagate `await` through all routes, auth/session helpers, review logic, media handling and long-running import loops. Reject unawaited transaction callbacks in review.
5. Run the same black-box suite on separate temporary node:sqlite and `file:` libSQL files, with node-only direct file introspection; assert actual leaf deletion behavior on BOTH backends (consumed magic-link challenge, logout invalidating a session, orphan media pruning), plus byte-identical media roundtrip and strictly increasing owner change-feed sequences. Do NOT add a deck FK cascade test: no deck-delete API exists.
6. Confirm web/terminal/root checks and full CI are green before describing the port as complete.
7. When implementation is ready, update the hosted runbook (without changing `fly.toml` or removing the PR #90 volume/entrypoint fallback) and document Turso secrets.

**NOT DONE:** No schema created or writes in hosted Turso, no auth token created, no Fly secrets, no provisioning, no deployment. This draft branch does not currently contain the backend conversion.

## Remote verification and billing boundaries

The libSQL `file:` tests prove the client/engine code path locally, **not** remote Turso correctness. Later staging must explicitly verify FK behavior over the wire (while not relying on it), acceptance of images up to the app's 2 MB limit, and transaction/failure semantics during network disruption. This PR makes **no calls** to hosted Turso.

At the current plan and usage there is **no added subscription charge**; overage billing is disabled on the account, so usage-based charges cannot accrue unless someone enables it. This is a present-state description, not a future pricing guarantee.
