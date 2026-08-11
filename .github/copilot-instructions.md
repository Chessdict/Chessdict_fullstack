# Chessdict — Copilot Instructions (always on)

Chessdict is a real-money, real-time chess dApp being rebuilt to handle **10,000+ concurrent users
(minimum)**. The first version failed under a few dozen users because authoritative state lived in one
Node process's memory. **Do not reintroduce that failure.**

## Before you write code

1. Read the relevant page in [`docs/`](../docs) — start at
   [docs/README.md](../docs/README.md) and [docs/architecture/00-system-overview.md](../docs/architecture/00-system-overview.md).
2. Match the **target** architecture in `docs/`, **not** the legacy `server.mjs`. The legacy monolith is
   the thing we are replacing, not a pattern to copy.
3. Follow [docs/delivery/01-coding-standards.md](../docs/delivery/01-coding-standards.md).

## Non-negotiable rules (these caused the original failure)

- **No authoritative state in process memory.** Never hold game/session/queue/matchmaking truth in a
  `Map`, `Set`, or module global. Live state → **Redis** (via `packages/redis-keys` builders);
  permanent → **Postgres** (Prisma). Any instance must be able to serve any request.
- **No `setTimeout`/`setInterval` for game logic** (clocks, timeouts, grace, expiry). Use Redis
  deadlines + the **scheduler** (BullMQ delayed jobs). See
  [architecture/04](../docs/architecture/04-game-engine-state.md).
- **No blocking/slow work on the hot path.** Ratings, persistence, notifications, and on-chain
  settlement run as **idempotent BullMQ jobs keyed by `gameId`** — never inline in a socket/request
  handler.
- **On-chain settlement is never fire-and-forget.** Use the outbox + settlement-worker (idempotent,
  nonce-serialized, retried). See [architecture/06](../docs/architecture/06-blockchain-settlement.md).
- **Server is authoritative.** Never trust client-supplied identity, FEN, or clock. Validate every move
  server-side with chess.js. Derive identity from the verified session, not an event field.
- **Realtime events go through the shared Zod contract** (`packages/contracts`). Never invent an inline
  event payload. See [architecture/02](../docs/architecture/02-realtime-gameplay.md).
- **Frontend:** no raw `socket.on` in components (only in `use*Socket` hooks); server state via TanStack
  Query, realtime state via the Zustand `game-store`, UI state local; components ≤ ~300 lines. See
  [architecture/01](../docs/architecture/01-frontend.md).

## Tech baseline

TypeScript strict (no `any`) · Zod at every boundary · Next.js 16 App Router + React 19 · Socket.IO +
Redis Streams adapter · Redis/Dragonfly for live state, pub/sub, queues, locks · PostgreSQL + Prisma ·
BullMQ · chess.js (server-authoritative) · Glicko-2 · SIWE + NextAuth v5 · Foundry (Solidity) · pino +
OpenTelemetry. Files kebab-case; absolute imports; apps import only from `packages/*` (never app→app).

## Architecture in one line

Stateless services (`web`, `realtime-gateway`, `game-engine`, `matchmaking`, `scheduler`, `workers/*`)
share state through Redis + Postgres and communicate via BullMQ. Everything scales horizontally.

## When you change architecture

Update the `docs/` page **and** its `.drawio` diagram **and** any affected
`.github/instructions/*.instructions.md` in the **same PR**.

## The "don't do this" list

Never: state in a `Map` in a service · `setTimeout` a clock · `socket.on` in a component · fire-and-forget
a tx · a 2,000-line component · an inline event payload · trust `userId` from the client · `any` to quiet
TS. Do the opposite — see
[coding-standards §11](../docs/delivery/01-coding-standards.md#11-quick-dont-do-this-list-the-exact-things-that-caused-the-mess).
