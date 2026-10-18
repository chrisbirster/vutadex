# Vutadex

A local-first TypeScript terminal flashcard application. No server, Fly.io, or cloud secrets required. The FSRS scheduler and additional study modes are planned, **not implemented**.

## Requirements
Node.js 26 and npm.

## Development
```sh
npm ci
npm run typecheck
npm run lint
npm test
node index.ts help
node index.ts deck create "Spanish"
node index.ts deck list
```

Implemented commands: `help`, `version`, `deck list`, and `deck create`. Other features in help are roadmap items.

## Local database
SQLite is stored at:
- macOS: `~/Library/Application Support/vutadex/vdex.db`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/vutadex/vdex.db`
- Windows: `%LOCALAPPDATA%\\vutadex\\vdex.db`

Schema changes use the SQLite `user_version` migration gate. Avoid manually editing `vdex.db`; back it up before schema upgrades.

## Branches
Create `feature/*` branches from `dev` and open PRs into `dev`. After milestone acceptance, open a reviewed PR from `dev` into `main`. CI runs on both branches and pull requests.

## Tests
Tests use Node's built-in test runner, written in TypeScript. The database persistence test uses a temporary `XDG_DATA_HOME` directory and does not write into a contributor's home.

Run `npm run format` to normalize whitespace (LF, trailing whitespace, final newline). See [docs/quality-gates.md](docs/quality-gates.md) for enforcement details.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/roadmap.md](docs/roadmap.md).
