---
description: "Use when writing or changing tests (unit, integration, E2E, load, or Foundry contract tests). Enforces the test pyramid, real-store integration tests, idempotency/concurrency coverage, and load gates."
applyTo: "**/*.test.ts,**/*.test.tsx,**/*.test.mjs,**/*.spec.ts,__tests__/**,load-tests/**,stress-test/**,chessdict-contracts/test/**,**/*.t.sol"
---
# Testing rules

Authoritative guide: [delivery/03-testing-strategy.md](../../docs/delivery/03-testing-strategy.md).

## Layers
- **Unit (Vitest):** pure logic in packages — chess-core, glicko, matchmaking pairing, clock/board math.
  Fast and plentiful. Keep the existing `__tests__/*.mjs` tests; relocate next to their package.
- **Integration (Vitest + Testcontainers):** services against **real Redis + Postgres** — Lua matchmaking
  pop, engine apply, settlement idempotency. No mock-only coverage for these.
- **E2E (Playwright):** connect wallet → queue → play a full game → result; the staking flow.
- **Contract (Foundry):** `forge test` incl. double-settle revert, refund/cancel, malicious ERC20,
  access control.
- **Load (k6/Artillery + socket client):** extend `stress-test/` → `load-tests/`; gate releases at
  10k and 20k CCU with dashboards.

## Must-cover (high-risk)
- Engine: replay → deterministic FEN; clock never negative; time conserved; all end conditions incl.
  insufficient-material-on-timeout draw; **two simultaneous moves → exactly one applied**.
- Matchmaking: never match a player twice; effective stake = `min`; band widening; two instances never
  double-match.
- Settlement: same `gameId` job twice → one payout; RPC failure → eventual settle; stale outbox →
  re-enqueued.
- Realtime: reconnect to a **different** instance resumes; rate limits drop floods; bad session token
  rejected.

## Rules
- Idempotency and concurrency are tested explicitly, not assumed.
- Deterministic fixtures; ephemeral stores; never test against prod data.
- Changed files must not decrease coverage; core money/engine packages target >90%.

## Done when
- New logic has unit tests; risky paths have integration tests vs real stores; release load gates green.
