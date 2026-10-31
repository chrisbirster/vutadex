# Vutadex Web (early application slice)

The web and terminal apps coexist under npm workspaces. The root `vutadex` package and `vdex` executable remain the published terminal CLI.

## Run locally

Node **26** and npm are required. From repository root:

```sh
npm ci
npm run web:dev
```

Open http://127.0.0.1:5173. To sign in locally, enter an email and follow the link from the local development inbox shown on the login page. Tokens are never logged. Development SQL is stored in `apps/web/data/vutadex-web.db`; it is separate from the CLI database. The app supports creating decks, basic/reverse/cloze notes, a due-card study session using the existing FSRS-7 algorithm, and factual review summaries.

```sh
npm run web:check
npm run terminal -- version
npm run terminal:check
```

## Limits of this slice

This is **not production-ready**. Production magic-link email sending is deliberately disabled pending the documented SES adapter, durable distributed rate limits and deployment review. Local Node SQLite is used until Turso/libSQL transactional validation. Extended note types, note editing, uploads, imports, undo, account-timezone rules, SSE, server draft sync, migrations, and full observability/release checks remain in the plan. Statistics show actual reviews but not a statistically valid mature-review retention metric. The existing CLI database stays untouched.

Server-only settings live in `apps/web/.env.example` (copy to `.env` and export variables as appropriate). Set `APP_ORIGIN` to the browser's actual origin or the API will reject mutations. Run Express on localhost or behind a trusted same-origin reverse proxy; no external exposure until auth and email gates have been completed.
