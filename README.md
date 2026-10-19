# Vutadex

A local-first TypeScript terminal flashcard application. No server, Fly.io, or cloud secrets required. FSRS-7, interactive studying, and Plandalf-style generated note types are implemented.

## Requirements
Node.js 26 and npm.

## Development
```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run test:coverage
node index.ts help
node index.ts deck create "Spanish"
node index.ts deck list
```

Implemented commands: `help`, `version`, `deck list`, `deck create`, `deck show`, `deck rename`, `deck describe`, and `deck delete`. See [M1 deck documentation](docs/m1.md). Card commands are now implemented too: `card add`, `card list`, `card show`, `card edit`, `card search`, and `card delete`. See [M2 card documentation](docs/m2.md). Interactive study sessions, FSRS-7 scheduling, review history and undo are implemented.

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

See [testing and coverage](docs/testing.md), [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/roadmap.md](docs/roadmap.md).

## FSRS-7 scheduler

```sh
node index.ts due
node index.ts card review 1 good
node index.ts card schedule 1
node index.ts card history 1
node index.ts card undo 1
```

See [M3 FSRS-7 documentation](docs/m3.md). The engine is pure TypeScript with a SQLite v2 migration. It uses a fixed default 90% target retention; personalized weight fitting is not part of M3.

## Interactive study sessions

```sh
node index.ts study
node index.ts study 1 --new-limit 10 --review-limit 50
node index.ts study --resume
node index.ts study 1 --restart
```

Space/Enter reveals the back; press 1–4 to rate, s to skip, u to undo or q to pause. The selected queue and progress survive restarts. See [M4 study session guide](docs/m4.md).

## Plandalf-style notes (M5)

Create, list and edit **logical notes** that generate one or more independent FSRS-7 cards:

```sh
node index.ts note types
node index.ts note add 1 basic "Capital of France?" "Paris"
node index.ts note add 1 reverse "France" "Paris"
node index.ts note add 1 cloze "{{c1::Paris}} is in {{c2::France}}." ""
node index.ts note list 1
node index.ts media add ./diagram.png
```

Other types: optional reverse, type-answer, multiple-choice, multiple-select, ordering and image-occlusion. Typed, choice, select and ordering interactions run inside `study` but **do not automatically choose an FSRS grade**. Existing manual cards remain supported; note edits regenerate cards under stable identities without discarding review history. See [M5 note types and media](docs/m5.md). `.deck` import/export and a graphical image viewer are not yet built.
