---
description: "Use when editing realtime/gameplay backend: Socket.IO gateway, game-engine, matchmaking, scheduler, clocks, presence, or the legacy server.mjs. Enforces stateless services, Redis-backed state, and no setTimeout clocks."
applyTo: "apps/realtime-gateway/**,apps/game-engine/**,apps/matchmaking/**,apps/scheduler/**,packages/contracts/**,packages/redis-keys/**,server.mjs,lib/**"
---
# Realtime / game-server rules

Authoritative guides: [architecture/02](../../docs/architecture/02-realtime-gameplay.md),
[03](../../docs/architecture/03-matchmaking.md), [04](../../docs/architecture/04-game-engine-state.md).

## The rule that fixes the scaling failure
- **No authoritative state in process memory.** No `Map`/`Set`/module-global for presence, active
  games, game state, matchmaking queues, timers, or locks. Use **Redis** via `packages/redis-keys`.
  Any instance must serve any socket; killing a pod must not lose a game.

## Clocks, timeouts, grace
- **Never `setTimeout`/`setInterval`** for clocks, first-move-abort, disconnect-grace, or expiry.
- Store an absolute **deadline** in the Redis game hash and schedule a **BullMQ delayed job**; a move
  replaces the pending job. The scheduler fires due deadlines. Deadlines survive redeploys.

## Gateway vs engine
- **gateway** = transport only: auth handshake (verify the session — never trust a client `userId`),
  Zod-validate events, room join/leave, relay to the engine via a Redis stream, push events back.
- **engine** = validate/apply moves with chess.js against the **stored** FEN (ignore client FEN for
  truth), mutate the Redis game hash atomically (Lua/`SET NX` lock — one writer per game), detect end
  conditions, enqueue side-effects.

## Events
- Every event has a Zod schema in `packages/contracts`, imported by client and server. Adding/changing
  an event updates the contract + the event table in architecture/02 + the frontend hook, same PR.
- Lock CORS to allowed origins (never `*`). Per-socket token-bucket rate limits. Tighten
  `maxHttpBufferSize`.

## Scaling specifics
- `transports: ["websocket"]`, sticky sessions at the LB, `@socket.io/redis-streams-adapter`,
  `connectionStateRecovery` on.
- On game end, enqueue persist/rating/settlement (idempotent, keyed by `gameId`) — never inline.

## Done when
- No process-memory game state; reconnect to a different instance resumes from Redis.
- No game-logic `setTimeout`; clocks via scheduler deadlines. Events Zod-validated; CORS locked.
