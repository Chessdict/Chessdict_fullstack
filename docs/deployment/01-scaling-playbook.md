# Scaling Playbook

> **Scope:** the concrete rules for reaching and holding **10,000 CCU minimum (20,000 burst)** — what to
> scale, on what signal, and where the ceilings are. Pairs with
> [00-deployment-guide.md](./00-deployment-guide.md) and [02-cost-model.md](./02-cost-model.md).

---

## 1. Load model (what 10k CCU actually means)

| Segment | Share | Count @10k | Traffic profile |
| --- | --- | --- | --- |
| In a live game | ~50% | 5,000 players ≈ **2,500 games** | 0.3–1 move/sec each |
| Browsing/lobby | ~30% | 3,000 | HTTP/RSC + queue events |
| Spectating | ~20% | 2,000 | read-only move stream |

Peak move rate (bullet-heavy): up to ~**5,000 moves/sec** worst case; sustained realistically
1,500–2,500/sec. Everything below is sized to the worst case with headroom.

## 2. What to scale, and on what signal

| Tier | Scale signal (autoscale on) | Rule of thumb | Ceiling / lever |
| --- | --- | --- | --- |
| **realtime-gateway** | connected sockets (`ccu_gateway`) + CPU | ~10k sockets/instance → +1 instance per ~8k sockets | fd limits, event-loop CPU → add instances |
| **web** | RPS + CPU | keep CPU < 65% | stateless → add instances |
| **game-engine** | moves/sec + CPU | 1 instance per ~2.5k moves/sec | CPU-bound chess.js → add instances / shard by gameId |
| **matchmaking** | queue depth + match latency | 2 for HA; rarely the bottleneck | Lua pop is cheap |
| **scheduler** | due-jobs backlog | 2 HA, shard timers by gameId hash | Redis job throughput |
| **workers** | BullMQ queue depth per queue | 1 worker per ~N pending; settlement stays concurrency-1 per signer | add workers (or signer keys for settlement) |
| **Redis/Dragonfly** | ops/sec + latency + memory | **the main ceiling** | vertical → Dragonfly multi-thread → Cluster/shard |
| **Postgres** | connections, write TPS, replica lag | pooler + replicas | shard/partition only if ever needed |

**Autoscaling policy:** target-tracking on the signal above with **scale-out fast, scale-in slow**
(e.g. add when CPU>65% for 1 min, remove when <35% for 10 min) to avoid flapping. Keep **minimum
replicas ≥ 2** on every stateful-adjacent tier for HA. Pre-scale before known events (tournaments,
marketing pushes) — don't rely purely on reactive autoscaling for spikes.

## 3. Redis is the hotspot — treat it as such

Because all live state and fan-out run through Redis, it is the first thing to hit a wall.

- Keep it **in-region / same VPC** as every service (latency).
- Prefer **Dragonfly** for a single high-throughput node (multi-threaded; often removes the need to
  cluster at this scale).
- If clustering: shard by `gameId` so a game's hash, moves, lock, and clock hash-tag to one slot
  (`game:{id}` → use `{id}` hash tags so related keys colocate).
- Separate **queues/adapter** onto a different Redis instance from **live game state** if a single
  instance's ops/sec saturates — they have different access patterns.
- Watch `redis_ops_per_sec`, `redis_latency_ms`, `connected_clients`, `evicted_keys` (should be ~0 on
  the state instance).

## 4. Connection math (the thing that broke before)

- Sockets are cheap **memory** but real **CPU** on message churn. Budget by event-loop CPU, not just
  RAM. `transports: ["websocket"]` (skip long-polling) roughly halves overhead.
- Raise `ulimit -n` (file descriptors) on gateway machines to well above the socket count.
- Use **sticky sessions** so the WS handshake and its upgrades land on one instance; the **Redis
  Streams adapter** delivers cross-instance.
- Client reconnect uses **exponential backoff + jitter** to prevent reconnect storms after a deploy
  (mirror `stress-test/04-reconnect-storm.mjs`).

## 5. Capacity checkpoints (prove it before you need it)

Run the existing `stress-test/` suite (extended, see
[delivery/03-testing-strategy.md](../delivery/03-testing-strategy.md)) at these gates:

| Gate | Target | Pass criteria |
| --- | --- | --- |
| Smoke | 500 CCU / 250 games | p95 move < 80 ms, 0 errors |
| Beta | 2,000 CCU / 1,000 games | p95 move < 100 ms, autoscale triggers correctly |
| Launch | **10,000 CCU / 2,500 games** | p95 move < 120 ms, no dropped games on deploy |
| Burst | **20,000 CCU / 5,000 games** | graceful: latency rises but no crashes/lost games |
| Chaos | kill a gateway + engine mid-load | games continue; clients resync from Redis |

## 6. Graceful degradation under overload

When a real spike exceeds capacity faster than autoscale can react:

1. **Shed at the edge:** Cloudflare rate-limits new connections; lobby shows a queue.
2. **Protect live games first:** new-match creation pauses before existing games degrade.
3. **Backpressure:** BullMQ absorbs async work; settlement/rating just run slightly behind (safe —
   they're idempotent).
4. **Never** silently fall back to in-memory state (the original sin) — fail the health check instead
   and let the LB route away.

## 7. Bottleneck triage (runbook)

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Move p95 rising, engine CPU high | validation CPU-bound | add game-engine instances |
| Move p95 rising, Redis latency high | Redis ops ceiling | scale Redis / Dragonfly / shard |
| Sockets dropping, gateway CPU high | too many sockets/instance | add gateway instances |
| "too many connections" DB errors | pool exhaustion | check pooler; lower per-instance `connection_limit` |
| Settlement lag / `settlement_pending` up | RPC slow or nonce stuck | check RPC; bump stuck tx; add signer lane |
| Reconnect storm after deploy | thundering herd | verify backoff+jitter; stagger rollout |

## 8. Definition of done (scaling)

- [ ] Every tier autoscales on the right signal with min-2 HA and scale-out-fast policy.
- [ ] Redis sized/sharded; live-state instance shows ~0 evictions.
- [ ] Launch gate (10k CCU) and burst gate (20k) pass with p95 move < 120 ms and zero dropped games.
- [ ] Chaos test proves pod loss doesn't lose games.
