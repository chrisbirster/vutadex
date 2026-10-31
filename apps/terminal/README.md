# Vutadex Terminal

The existing CLI is preserved as the root `vutadex` npm package, including its `vdex` bin and SQLite migrations. This workspace is the terminal-app entrypoint while CLI modules remain at repository root until a separately verified move.

- `npm run terminal -- help` — run the CLI directly on Node 26.
- `npm run terminal:check` — existing CLI typecheck, style and tests.
- `npm run build` and `npm pack` from the root preserve the published CLI artifact.

**Do not** point the web app at the CLI's local database or move the existing SQL files without the full CLI packaging regression suite.
