# AGENTS.md — Chessdict

Universal guide for AI coding agents (Claude/Claude Code, Codex, Cursor, Copilot, Gemini, and others).
Copilot also reads [`.github/copilot-instructions.md`](.github/copilot-instructions.md); Cursor also
reads [`.cursorrules`](.cursorrules). **This file is the shared, tool-agnostic contract** so every
teammate's assistant produces consistent code.

## What Chessdict is

A real-money, real-time chess dApp (Next.js + Socket.IO + Redis + Postgres + Solidity/Foundry) being
rebuilt to handle **10,000+ concurrent users (minimum)**. The first version collapsed under a few dozen
users because authoritative state lived in one Node process's memory. **Your job is to never
reintroduce that.**

## Read before coding (in this order)

1. [docs/README.md](docs/README.md) — map of the plan.
2. [docs/architecture/00-system-overview.md](docs/architecture/00-system-overview.md) — the mental model.
3. The specific page for your task (frontend 01, realtime 02, matchmaking 03, engine/clock 04, ratings
   05, settlement 06, data 07, auth 08, tournaments 09, observability 10, security 11).
4. [docs/delivery/01-coding-standards.md](docs/delivery/01-coding-standards.md).

Match the **target** architecture in `docs/` — **not** the legacy `server.mjs`, which is the monolith we
are replacing.

## Non-negotiable rules (these caused the original failure)

1. **No authoritative state in process memory.** No `Map`/`Set`/module global for game, session,
   presence, queue, timer, or lock state. Live state → **Redis** (`packages/redis-keys`); permanent →
   **Postgres** (Prisma). Any instance serves any request; killing a pod loses no game.
2. **No `setTimeout`/`setInterval` for game logic.** Clocks, first-move-abort, disconnect-grace, and
   expiry use **Redis deadlines + the scheduler** (BullMQ delayed jobs).
3. **No slow work on the hot path.** Ratings, persistence, notifications, settlement → **idempotent
   BullMQ jobs keyed by `gameId`**.
4. **On-chain settlement is never fire-and-forget.** Outbox + settlement-worker: idempotent,
   nonce-serialized, retried, reconciled. Redeemer key only in the worker (KMS).
5. **Server is authoritative.** Validate every move server-side with chess.js against the stored FEN.
   Derive identity from the verified session — never trust a client `userId`, FEN, or clock.
6. **Realtime events use the shared Zod contract** (`packages/contracts`). No inline event payloads.
7. **Frontend:** no raw `socket.on` in components (only `use*Socket` hooks); server state → TanStack
   Query, realtime → Zustand `game-store`, UI → local; components ≤ ~300 lines.
8. **Strict TypeScript, no `any`.** Zod at every boundary. kebab-case files. Absolute imports. Apps
   import only from `packages/*` (never app→app).

## Architecture in one line

Stateless services — `web`, `realtime-gateway`, `game-engine`, `matchmaking`, `scheduler`, `workers/*`
— share state through **Redis + Postgres** and communicate via **BullMQ**. Everything scales
horizontally. See [docs/diagrams/](docs/diagrams) for the `.drawio` diagrams.

## Tech baseline

Next.js 16 App Router · React 19 · Tailwind 4 · Radix/shadcn · Zustand · TanStack Query · Socket.IO +
Redis Streams adapter · Redis/Dragonfly · PostgreSQL + Prisma · BullMQ · chess.js · Glicko-2 · SIWE +
NextAuth v5 · viem/wagmi/ethers · Foundry · pino + OpenTelemetry · Vitest/Playwright/Foundry/k6.

## Workflow

- **Contracts first:** add the Zod schema to `packages/contracts` before wiring an event/DTO.
- **Own your lane:** work within one app/package boundary (see
  [docs/delivery/02-migration-plan.md](docs/delivery/02-migration-plan.md#3-sequencing--ownership-4-devs-no-collisions)).
- **Test what you change** ([docs/delivery/03-testing-strategy.md](docs/delivery/03-testing-strategy.md));
  idempotency and concurrency are tested explicitly.
- **If you change architecture,** update the `docs/` page + `.drawio` diagram + the affected
  `.github/instructions/*.instructions.md` in the same change.

## Commands

```bash
npm install            # install
npm run dev            # run app (currently server.mjs; per-service scripts after the split)
npm test               # Vitest
npm run lint           # ESLint
npm run stress         # load-test suite (stress-test/, becoming load-tests/)
# contracts:
cd chessdict-contracts && forge test
```

## The "don't do this" list (rejected in review)

state in a `Map` in a service · `setTimeout` a clock · `socket.on` in a component · fire-and-forget a tx
· a 2,000-line component · an inline event payload · trust `userId` from the client · `any` to quiet TS.
Do the opposite — see
[docs/delivery/01-coding-standards.md §11](docs/delivery/01-coding-standards.md#11-quick-dont-do-this-list-the-exact-things-that-caused-the-mess).
