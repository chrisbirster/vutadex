# Vutadex

A local-first terminal flashcard app. Decks and cards are stored in a SQLite database on your own computer. FSRS scheduling and additional study methods are planned; they are not implemented yet.

## Requirements

Node.js 26 and npm.

## Development

```sh
npm ci
node index.ts help
node index.ts deck create "Spanish"
node index.ts deck list
npm test
```

Other commands listed in help are a roadmap, not all are functional yet.

## Data location

- macOS: `~/Library/Application Support/vutadex/vdex.db`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/vutadex/vdex.db`
- Windows: `%LOCALAPPDATA%\\vutadex\\vdex.db`

This is a local CLI: no Fly.io deployment, API server, or cloud secrets are needed. CI runs automated tests on pull requests and on pushes to `main`.

## Contributing

Create a branch, make focused changes, run `npm test`, and open a pull request. Do not commit local databases or `node_modules`.
