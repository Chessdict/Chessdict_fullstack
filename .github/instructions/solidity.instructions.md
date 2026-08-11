---
description: "Use when editing Solidity smart contracts or on-chain settlement code (Chessdict.sol, Foundry scripts/tests, settlement-worker). Enforces idempotent payouts, SafeERC20, access control, and durable outbox settlement."
applyTo: "chessdict-contracts/**,apps/workers/settlement/**,packages/contracts/**/abi/**"
---
# Solidity + settlement rules

Authoritative guides: [architecture/06](../../docs/architecture/06-blockchain-settlement.md),
[security §web3](../../docs/architecture/11-security.md#4-web3--settlement).

## Contract (`Chessdict.sol`, Foundry)
- Checks-effects-interactions; use `SafeERC20` for all token transfers.
- `setWinnerSingle` is `onlyRedeemer` and **idempotent per game** — a second settle reverts (game marked
  settled/inactive). This is the on-chain backstop against double payout.
- Explicit visibility; custom errors over `require` strings; emit an event on every state change
  (indexed off-chain for reconciliation).
- Maintain full Foundry tests incl. revert paths, refund/cancel, malicious ERC20, access control.
  `forge fmt`; run Slither in CI.

## Off-chain settlement (never fire-and-forget)
- Write a `SettlementOutbox` row in the **same transaction** that finalizes the game; enqueue a BullMQ
  job keyed by `gameId`. The `settlement-worker` drains it.
- **Idempotent** at app (outbox status), tx (track `txHash`, check receipt before resend), and contract
  levels. A retry or duplicate job must never double-pay.
- **Nonce-serialized per signer** (Redis `lock:signer:{addr}` or concurrency-1 queue). Stuck tx →
  bump-and-replace same nonce, never a new one. EIP-1559 fees with a cap.
- **Refund/cancel** every staked-setup failure through the same worker + outbox.
- **Reconciliation job** re-drives stale `PENDING` rows and emits `settlement_pending` (alerted).

## Key management
- Redeemer key only in `settlement-worker`, ideally via KMS/secrets manager. Never on web/gateway,
  never in the client bundle, never in CI. Never log keys/signatures.
- Token amounts as BigInt/string — never floats.

## Done when
- No inline `setWinnerSingle` on the hot path; payout is idempotent + nonce-safe + reconciled.
- Contract tests cover double-settle revert and refund paths; key isolated to the worker.
