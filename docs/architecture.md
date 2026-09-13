# Architecture

## Runtime

```text
vutadex.com              game.vutadex.com
     \                         /
      \                       /
              Fly Proxy
                  |
          Go 1.26 net/http
      +-----------+------------+
      | /api/v1/* | /ws/v1/*   |
      | JSON      | WebSocket  |
      +-----------+------------+
                  |
           domain packages
                  |
             PostgreSQL

Vite + Solid 2 + Router + StyleX
                  |
        internal/web/dist
                  |
              go:embed
                  |
            one Go binary
```

One binary initially serves both public hosts. The UI chooses its route surface by hostname while deployment origins are returned by `/api/v1/meta` rather than scattered through frontend code.

## Package boundaries

- `cmd/vutadex`: process wiring, environment, shutdown.
- `internal/web`: embedded SPA and deep-link fallback.
- `internal/httpapi`: transport only.
- `internal/database`: database connection lifecycle.
- `internal/auth`: magic-link/session domain and stores.
- `internal/football/model`: stable football entities.
- `internal/football/playbook`: play definitions.
- `internal/football/simulation`: deterministic game engine.
- `internal/coach`: computer play caller.
- `internal/game`: multiplayer call-locking state.
- `internal/realtime`: WebSocket fanout.
- `internal/league`: deterministic league generation.
- `internal/franchise`: contracts/trades/draft model.
- `internal/dex`: persistent-history boundary.
- `internal/player`: validated player-control input.
- `internal/live`: external live-data adapters.

## Persistence

PostgreSQL is authoritative. Atlas owns schema changes. Application startup connects and fails fast in production; it does not silently create a different schema. High-frequency animation frames are never stored. Store seeds, engine version, calls, inputs and meaningful play events, then reproduce presentation frames.

## Scaling

Start with one Fly machine/region so each game room has one obvious owner. Before horizontal realtime scaling, add durable room leases and a cross-instance event bus; do not introduce distributed coordination prematurely.
