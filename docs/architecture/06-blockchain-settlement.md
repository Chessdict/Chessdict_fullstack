# 06 — Blockchain Settlement Architecture

> **Scope:** the money path — turning a finished staked game into an on-chain payout, safely and
> exactly once. **Diagram:** [settlement.drawio](../diagrams/settlement.drawio). **Governing
> instructions:** [`.github/instructions/solidity.instructions.md`](../../.github/instructions/solidity.instructions.md).

---

## 1. What is wrong today (this can lose user funds)

`server.mjs` settles staked games like this:

```js
// fire-and-forget, inline, no retry, no idempotency, no nonce control
async function settleStakedGame(onChainGameId, winnerAddress, isDraw) {
  const tx = await chessdictContract.setWinnerSingle(gameIdBn, winner, isDraw);
  const receipt = await tx.wait();
}
```

Failure modes, all realistic:

- **RPC hiccup or gas spike** → the call throws, is logged, and the payout is **silently lost**. Funds
  sit in the escrow contract forever.
- **Two instances** (once scaled) could both call `setWinnerSingle` for the same game → nonce clashes,
  wasted gas, or double attempts.
- **Process restart** mid-settlement → no record of what was in flight.
- The **redeemer private key** is read from env and used inline on the same box that serves sockets — a
  large attack surface.

For an app that holds user stakes, "log and move on" is unacceptable. Settlement must be a durable,
idempotent, retrying pipeline.

## 2. Target: transactional outbox + settlement worker

Use the **outbox pattern**. The engine, when a staked game ends, writes an intent to durable storage in
the **same** step that finalizes the game; a dedicated **settlement-worker** drains it.

```mermaid
sequenceDiagram
    participant ENG as game-engine-svc
    participant PG as Postgres (outbox)
    participant Q as BullMQ settlement queue
    participant W as settlement-worker
    participant SIGN as signer (redeemer)
    participant CH as Chessdict.sol
    ENG->>PG: INSERT settlement_outbox{gameId, onChainGameId, winner, isDraw, status=PENDING} (same tx as game finalize)
    ENG->>Q: enqueue settle{gameId} (idempotencyKey = gameId)
    W->>PG: load outbox row; skip if already SETTLED
    W->>SIGN: acquire per-signer nonce lock (Redis)
    W->>CH: setWinnerSingle(onChainGameId, winner, isDraw) with managed nonce + gas
    CH-->>W: receipt (confirmed)
    W->>PG: UPDATE outbox SET status=SETTLED, txHash
    Note over W,Q: on failure → release nonce, exponential backoff retry; after N tries → DEAD_LETTER + alert
```

Why outbox **and** queue: the outbox row in Postgres is the durable source of truth ("this payout is
owed"); the BullMQ job is the efficient trigger. If Redis is wiped, a reconciliation sweep re-enqueues
any `PENDING` outbox rows — so a payout can never be permanently dropped.

## 3. Idempotency (exactly-once payout)

Three layers so a retry or duplicate never double-pays:

1. **Application:** the outbox row keyed by `gameId` with a `status`; the worker no-ops if already
   `SETTLED` or `IN_FLIGHT` with a live tx.
2. **On-chain:** `setWinnerSingle` should be safe to call at most once per game — the contract marks the
   game inactive/settled after payout and reverts a second attempt (verify/keep this invariant in
   `Chessdict.sol`). The chain is the final idempotency backstop.
3. **Tx-level:** track the submitted `txHash`; on restart, check the receipt before resubmitting rather
   than blindly re-sending.

## 4. Nonce & gas management

- **Serialize per signer.** All txs from the redeemer key must be nonce-ordered. Acquire a Redis lock
  `lock:signer:{address}` (or run a single-concurrency BullMQ queue for settlement) so only one tx is
  built/sent at a time, and track the next nonce in Redis. This is why `settlement-worker` concurrency
  is 1 per signer (scale by adding **more signer keys**, each its own lane, if throughput ever needs
  it).
- **Gas:** use EIP-1559 fees from the provider with a cap; on "underpriced"/stuck tx, **bump and
  replace** (same nonce, higher fee) rather than sending a new one.
- **Confirmations:** wait for N confirmations appropriate to the chain before marking `SETTLED`.

## 5. Refund / cancel path (staked setup failures)

The matchmaking staked state machine ([03](./03-matchmaking.md#4-staked-matchmaking-money-path)) can end
in cancellation (a player never staked, or timed out). That is also a settlement concern:

| Situation | Action |
| --- | --- |
| Only creator staked, joiner never confirmed | Enqueue **refund/cancel** → `cancelGameSingle` (or equivalent) so the creator gets their stake back |
| Neither staked | Nothing on-chain to undo; just release the Redis state |
| Draw | `setWinnerSingle(gameId, ZeroAddress, isDraw=true)` — split/refund per contract rules |
| Dispute / stuck game | Admin-triggered settlement job with an audit log (see [10-observability.md](./10-observability.md)) |

Every branch goes through the **same worker + outbox**, so all money movements are durable, retried, and
auditable.

## 6. Key management & security (critical)

- The **redeemer key never lives on the gateway or web tier.** Only `settlement-worker` holds signing
  ability, and ideally via a **KMS / secrets manager** (AWS KMS, GCP KMS, or a signer service) so the
  raw key is never in app memory or env on a public-facing box.
- Least privilege: the redeemer should only be able to call settlement functions, nothing else.
- Rate-limit and **alert** on abnormal settlement volume or value.
- Consider a **multisig or timelock** for admin/owner actions on the contract.
- Full checklist in [11-security.md](./11-security.md#web3--settlement).

## 7. Reconciliation (defense in depth)

A periodic **reconciliation job** compares on-chain state to the outbox:

- Any `PENDING`/`IN_FLIGHT` outbox row older than a threshold → re-enqueue or alert.
- Any game marked settled in DB but not on-chain (or vice-versa) → flag for manual review.
- Emit a metric `settlement_pending_count`; page if it grows.

This is what guarantees the north-star "**100% eventually settled**": even a multi-hour RPC outage only
delays payouts; it never loses them.

## 8. Contract (`Chessdict.sol`) notes

- Keep Foundry (`chessdict-contracts/`). Ensure: `setWinnerSingle` is `onlyRedeemer`, idempotent per
  game, uses `SafeERC20`, follows checks-effects-interactions, and emits events for every state change
  (the app indexes these).
- Add/verify events consumed off-chain: `GameSingleCreated`, `GameSingleJoined`, `WinnerSet`,
  `GameCancelled`. The worker keys settlement off game state, but events feed reconciliation.
- Maintain full Foundry test coverage (`chessdict-contracts/test/Chessdict.t.sol`), including
  double-settle reverts and refund paths.

## 9. Definition of done (settlement)

- [ ] No inline `setWinnerSingle` in the socket/engine path — everything via outbox + `settlement-worker`.
- [ ] Payout is idempotent at app, tx, and contract levels; a duplicate job never double-pays.
- [ ] Nonce serialized per signer; stuck txs are fee-bumped, not duplicated.
- [ ] Refund/cancel path covered for every staked-setup failure.
- [ ] Redeemer key isolated to the worker (KMS preferred); reconciliation job + `settlement_pending` alert live.
