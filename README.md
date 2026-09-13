# VutaDex

VutaDex is an online American-football simulator built around a live X/O field. The long-term product supports three levels of control over the same persistent football universe: GM, coach, and on-field player.

## Stack

- Go 1.26 `net/http`
- Vite 8 + Solid 2 (`next`) + Solid Router + StyleX
- PostgreSQL through `pgx`
- Atlas schema management
- Magic-link authentication over Amazon SES
- SST for SES/DNS infrastructure
- WebSockets for live game rooms
- Docker + Fly.io

`vutadex.com` is the marketing surface. `game.vutadex.com` is the authenticated player application. Both can terminate at the same Go binary.

## Development

```bash
corepack pnpm install
cp .env.example .env
pnpm dev          # Vite :5173, proxies /api and /ws to Go
pnpm dev:api      # Go :8080
pnpm verify
```

The Vite build is emitted into `internal/web/dist` and embedded into the release Go binary.

## Branching

```text
feature/* -> dev -> release PR -> main -> vX.Y.Z
```

See `docs/` for the architecture and M0-M12 roadmap.