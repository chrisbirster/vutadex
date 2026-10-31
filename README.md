# Vutadex

A local-first TypeScript terminal flashcard application. No server, Fly.io, or cloud secrets required. FSRS-7, interactive studying, and Plandalf-style generated note types are implemented.

## Requirements
Node.js 26 and npm.

## Web application roadmap

The proposed browser application is planned in [Web app milestones and tasks](docs/web-app-plan.md): React, TypeScript, TanStack Router, use-immer, Express, Pino, and email magic-link authentication with shared account data across devices.

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

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/roadmap.md](docs/roadmap.md).

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

Other types: optional reverse, type-answer, multiple-choice, multiple-select, ordering and image-occlusion. Typed, choice, select and ordering interactions run inside `study` but **do not automatically choose an FSRS grade**. Existing manual cards remain supported; note edits regenerate cards under stable identities without discarding review history. See [M5 note types and media](docs/m5.md). Plandalf-compatible .deck v2 content-only export/import is available. Image-occlusion .deck transfer needs separate media handling; the local terminal does not render graphical masks.


## Distribution and recovery (v1 release candidate)

Use Node.js **26 or later**. From a checked-out repository:

```sh
npm ci
npm run build
npm pack --ignore-scripts
npm install -g ./vutadex-1.0.0.tgz
vdex version
vdex help
```

These commands install a **local tarball**, not a published npm-registry package. GitHub releases are published only after successful `main` CI. This is a local application with no cloud deployment.

Share content with `vdex deck export 1 > shared.deck` and `vdex deck import shared.deck`. The interchange is **content only**, excluding personal FSRS history, due dates and media binaries. Backup and recovery instead use `vdex backup create ./snapshot.json` and `vdex backup restore ./snapshot.json`. Restore intentionally refuses to overwrite any existing Vutadex data directory; recover on a fresh profile or after moving the old directory aside yourself. Keep backup files private because they include your study records and media without encryption.

The v1 candidate is validated on Node 26 across Ubuntu, macOS and Windows. M6/M7 acceptance results and release status must be confirmed on the version bump PR and main before considering it released.
