# Realtime games

Each live game has one authoritative server room.

```text
Team X ----\
             room -> engine -> ordered events -> WebSocket clients
Team O ----/                       |
                                  spectators
```

Offense and defense calls are private until both are locked or the play clock expires. `internal/game.Room` implements the first lock boundary. WebSocket messages must carry sequence numbers so reconnecting clients can detect gaps.

## Reconnect contract

A reconnect provides last-seen sequence. The server sends a compact current snapshot plus missing semantic events. Clients never reconstruct authority from local state.

## Player Mode

Input frames contain sequence, control position, normalized movement and a constrained action. The server validates inputs before applying them. QB/RB/MLB are the first supported controls; arbitrary client coordinates or result claims are rejected.
