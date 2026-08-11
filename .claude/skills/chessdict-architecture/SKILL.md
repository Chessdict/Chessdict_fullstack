---
name: chessdict-architecture
description: "Chessdict rebuild architecture, conventions, and scaling rules for a real-money real-time chess dApp targeting 10,000+ concurrent users. Use when implementing, reviewing, planning, or debugging any Chessdict backend or frontend work — realtime/Socket.IO gameplay, matchmaking, the game clock/engine, Glicko ratings, on-chain staking/settlement, Redis/Postgres data, auth, tournaments, deployment, or scaling. Also use to keep pull requests consistent across teammates and different LLMs."
---

# Chessdict Architecture Skill

Use this skill for **any** Chessdict task. It routes you to the authoritative plan in `docs/` and
enforces the rules that stop the codebase from regressing into the monolith that failed under load.

## Context

Chessdict is being rebuilt because v1 could not handle even a few dozen users: authoritative game state
(clocks, sockets, matchmaking) lived in one Node process's memory (`server.mjs`, ~4,800 lines), so it
could not scale horizontally. Target: **10,000+ CCU minimum**. The fix is stateless services sharing
state through **Redis + Postgres**, with async work on **BullMQ** queues.

## When to use

- Implementing a feature or refactor (backend or frontend).
- Reviewing a diff/PR for consistency and anti-patterns.
- Planning a change or answering an architecture question.
- Debugging a scaling, realtime, clock, matchmaking, or settlement issue.

## Procedure

1. **Read the map:** [docs/README.md](../../../docs/README.md) →
   [docs/architecture/00-system-overview.md](../../../docs/architecture/00-system-overview.md).
2. **Open the page for the task:**
   - Frontend/UI → [architecture/01-frontend.md](../../../docs/architecture/01-frontend.md)
   - Realtime/Socket.IO → [architecture/02-realtime-gameplay.md](../../../docs/architecture/02-realtime-gameplay.md)
   - Matchmaking → [architecture/03-matchmaking.md](../../../docs/architecture/03-matchmaking.md)
   - Game engine/clock → [architecture/04-game-engine-state.md](../../../docs/architecture/04-game-engine-state.md)
   - Ratings → [architecture/05-ratings.md](../../../docs/architecture/05-ratings.md)
   - Staking/settlement → [architecture/06-blockchain-settlement.md](../../../docs/architecture/06-blockchain-settlement.md)
   - Data (Redis/Postgres) → [architecture/07-data-layer.md](../../../docs/architecture/07-data-layer.md)
   - Auth → [architecture/08-auth-identity.md](../../../docs/architecture/08-auth-identity.md)
   - Tournaments → [architecture/09-tournaments.md](../../../docs/architecture/09-tournaments.md)
   - Observability → [architecture/10-observability.md](../../../docs/architecture/10-observability.md)
   - Security → [architecture/11-security.md](../../../docs/architecture/11-security.md)
   - Deploy/scale/cost → [docs/deployment/](../../../docs/deployment)
   - Repo structure & standards → [docs/delivery/](../../../docs/delivery)
3. **Contracts first:** for any realtime event or DTO, add/update the Zod schema in
   `packages/contracts` before wiring producers/consumers.
4. **Implement within one app/package boundary** (apps import only from `packages/*`; never app→app),
   following [docs/delivery/01-coding-standards.md](../../../docs/delivery/01-coding-standards.md).
5. **Test** per [docs/delivery/03-testing-strategy.md](../../../docs/delivery/03-testing-strategy.md);
   cover idempotency and concurrency explicitly for engine/matchmaking/settlement.
6. **Update docs + `.drawio` diagram + the affected `.github/instructions/*` file** in the same change
   if you altered architecture.

## Hard rules (reject code that breaks any of these)

1. No authoritative state in a `Map`/`Set`/global → Redis via `packages/redis-keys`.
2. No `setTimeout`/`setInterval` for clocks/timeouts/grace/expiry → Redis deadlines + scheduler.
3. No slow/blocking work on the hot path → idempotent BullMQ jobs keyed by `gameId`.
4. No fire-and-forget on-chain tx → outbox + settlement-worker (idempotent, nonce-serialized,
   reconciled); redeemer key only in the worker.
5. Server-authoritative: validate moves with chess.js against the stored FEN; identity from the verified
   session, never a client field.
6. Realtime payloads from `packages/contracts` (Zod) — no inline shapes.
7. Frontend: no raw `socket.on` in components (use `use*Socket` hooks); server state → TanStack Query,
   realtime → Zustand `game-store`, UI → local; components ≤ ~300 lines.
8. Strict TS, no `any`; Zod at boundaries; kebab-case files; absolute imports.

## Output expectations

- Cite the `docs/` page(s) you followed.
- Tick the relevant "Definition of Done" checklist from that page.
- List any docs/diagrams/instruction files you updated.
