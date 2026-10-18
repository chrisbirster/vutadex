# Contributing

Vutadex uses TypeScript and Node 26. Run `npm ci`, `npm run typecheck`, and `npm test` locally.

- Branch from `dev` using `feature/mN-description` or `fix/description`.
- Open PRs against `dev`, not `main`; do not merge until CI is green.
- Keep the CLI entry point thin; put command logic in `commands/`, persistence in `database/`, and OS paths in `utils/`.
- Add tests for every behavior change, especially persistent SQLite data and migrations.
- Do not commit `node_modules`, databases, secrets, or personal study data.
- When a milestone is complete, open a separate `dev` → `main` PR and tag the release following review.
