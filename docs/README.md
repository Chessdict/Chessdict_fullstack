# Chessdict — Rebuild Architecture & Delivery Plan

This directory is the **single source of truth** for how Chessdict is designed, built, deployed, and
maintained. It exists to solve two problems the team hit during the first build:

1. **The product could not survive a few dozen concurrent users** — yet the business target is
   **10,000 concurrent users minimum**. Root cause: authoritative game state (timers, sockets,
   matchmaking queues) lived in the memory of one Node process, so the app physically could not scale
   to a second instance. See [architecture/00-system-overview.md](./architecture/00-system-overview.md).
2. **Four+ engineers using different LLMs produced inconsistent, spaghetti code.** Root cause: no
   shared, machine-readable architecture. This plan fixes that with LLM guides in
   [`.github/`](../.github), [`AGENTS.md`](../AGENTS.md), and
   [`.claude/skills/`](../.claude/skills) that all point back to these documents.

> **Golden rule for humans and LLMs:** Read the relevant architecture doc **before** writing code.
> Every PR must conform to the target design here, not to the legacy `server.mjs`.

---

## How to navigate

| If you want to… | Read |
| --- | --- |
| Understand the whole system in 10 minutes | [architecture/00-system-overview.md](./architecture/00-system-overview.md) |
| Work on UI / Next.js | [architecture/01-frontend.md](./architecture/01-frontend.md) |
| Work on live gameplay / sockets | [architecture/02-realtime-gameplay.md](./architecture/02-realtime-gameplay.md) |
| Work on matchmaking | [architecture/03-matchmaking.md](./architecture/03-matchmaking.md) |
| Work on the game clock / move validation | [architecture/04-game-engine-state.md](./architecture/04-game-engine-state.md) |
| Work on ratings | [architecture/05-ratings.md](./architecture/05-ratings.md) |
| Work on staking / on-chain settlement | [architecture/06-blockchain-settlement.md](./architecture/06-blockchain-settlement.md) |
| Work on the database / cache | [architecture/07-data-layer.md](./architecture/07-data-layer.md) |
| Work on auth / wallet login | [architecture/08-auth-identity.md](./architecture/08-auth-identity.md) |
| Work on tournaments | [architecture/09-tournaments.md](./architecture/09-tournaments.md) |
| Add logging / metrics / alerts | [architecture/10-observability.md](./architecture/10-observability.md) |
| Harden security | [architecture/11-security.md](./architecture/11-security.md) |
| Deploy / scale / estimate cost | [deployment/](./deployment) |
| Know the target folder layout & conventions | [delivery/](./delivery) |
| Migrate the current code safely | [delivery/02-migration-plan.md](./delivery/02-migration-plan.md) |

## Diagrams

All diagrams live in [`diagrams/`](./diagrams) as **Draw.io / diagrams.net XML** (`.drawio`). Open them
at <https://app.diagrams.net> or with the "Draw.io Integration" VS Code extension
(`hediet.vscode-drawio`). Each architecture doc also embeds a **Mermaid** version so it renders inline
in GitHub and the VS Code Markdown preview.

| Diagram | File |
| --- | --- |
| System context (who talks to Chessdict) | [diagrams/system-context.drawio](./diagrams/system-context.drawio) |
| Container architecture (services & data stores) | [diagrams/container-architecture.drawio](./diagrams/container-architecture.drawio) |
| Realtime gameplay | [diagrams/realtime-gameplay.drawio](./diagrams/realtime-gameplay.drawio) |
| Matchmaking | [diagrams/matchmaking.drawio](./diagrams/matchmaking.drawio) |
| Game engine & clock (move sequence) | [diagrams/game-engine-state.drawio](./diagrams/game-engine-state.drawio) |
| On-chain settlement | [diagrams/settlement.drawio](./diagrams/settlement.drawio) |
| Data layer | [diagrams/data-layer.drawio](./diagrams/data-layer.drawio) |
| Deployment topology | [diagrams/deployment-topology.drawio](./diagrams/deployment-topology.drawio) |

---

## The plan in one paragraph

Break the 4,794-line `server.mjs` monolith into **stateless, independently scalable services** that
share state through **Redis** (authoritative live state + pub/sub) and **PostgreSQL** (system of
record). A thin **realtime gateway** (Socket.IO, sticky sessions, Redis Streams adapter) handles
connections; **matchmaking**, the **game/clock engine**, **rating updates**, and **on-chain
settlement** run as workers driven by **Redis-backed queues (BullMQ)**. The Next.js app serves
UI/RSC. This lets us run *N* copies of every tier behind a load balancer, autoscale on CPU/CCU, and
comfortably clear 10,000 concurrent users, with headroom to ~20,000 at burst. Uniformity across the
team is enforced by the LLM guides that reference these docs on every task.

## Target north-star metrics

| Metric | Target |
| --- | --- |
| Concurrent users (CCU) | **10,000 sustained (minimum)**, 20,000 burst |
| Concurrent live games | 5,000+ |
| Move round-trip latency (p95) | < 120 ms in-region |
| Match time (casual, populated pool) | < 3 s p95 |
| Availability | 99.9% |
| Settlement success (staked) | 100% eventually, with automatic retry |

## Maintenance rule

When you change the architecture, update the doc **and** the diagram **in the same PR**, then update
the affected file(s) under [`.github/instructions/`](../.github/instructions). Docs that drift from
reality are worse than no docs.
