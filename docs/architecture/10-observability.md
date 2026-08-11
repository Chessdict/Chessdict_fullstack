# 10 — Observability

> **Scope:** how we *see* what the system is doing so we can catch the next "falls over at 30 users"
> before users do. Logs, metrics, traces, and alerts.

---

## 1. Why this is a first-class concern now

The first build had effectively no observability — the team discovered the ceiling by watching it
crash. At 10k CCU you cannot debug by reading `console.log`. Every service must emit structured
telemetry from day one.

## 2. Stack (vendor-neutral, cheap)

| Signal | Tool | Notes |
| --- | --- | --- |
| Instrumentation | **OpenTelemetry (OTel) SDK** in every service | One standard; swap backends freely |
| Metrics | **Prometheus** (scrape) + **Grafana** dashboards | Or Grafana Cloud free tier |
| Logs | **Loki** (structured JSON via **pino**) | Correlate by `traceId` |
| Traces | **Tempo** (or Jaeger) | Follow a move across gateway→engine→Redis |
| Errors | **Sentry** | Frontend + backend exceptions, releases, source maps |
| Uptime | External check (BetterStack/Grafana Synthetic) | Alerts if the site/WS is down |

Self-host the **Grafana + Prometheus + Loki + Tempo (LGTM)** stack cheaply, or use **Grafana Cloud**'s
free/low tier to avoid ops. Sentry has a generous free tier. This keeps observability near-zero cost at
this scale.

## 3. The four golden signals + product KPIs

Track per service (latency, traffic, errors, saturation) **and** these product-specific metrics:

| Metric | Why it matters |
| --- | --- |
| `ccu_gateway` (connected sockets) | Primary scaling signal; drives autoscaling |
| `active_games` | Capacity of engine/Redis |
| `move_latency_ms` (histogram, p50/p95/p99) | Core UX SLO (< 120 ms p95) |
| `matchmaking_wait_ms` + `queue_depth` | Match quality/health |
| `redis_ops_per_sec`, `redis_latency_ms` | The main throughput ceiling |
| `settlement_pending_count`, `settlement_failures` | **Money safety** — page immediately |
| `clock_timeout_lag_ms` | Scheduler accuracy (are clocks firing on time?) |
| `db_pool_in_use` / `db_conn_wait` | Connection exhaustion early warning |
| `bull_queue_depth{queue}` | Backpressure in async work |
| `ws_disconnects`, `reconnect_rate` | Network/stability |

## 4. Tracing a move (what good looks like)

One trace, spanning services, correlated by `traceId` propagated through the Redis stream message:

```
trace: move
 ├─ span gateway.receiveMove (authz, validate)
 ├─ span redis.xadd
 ├─ span engine.applyMove (chess.js)
 │   ├─ span redis.lua.applyMove
 │   └─ span scheduler.setDeadline
 └─ span gateway.emitOpponentMove
```

When p95 `move_latency_ms` spikes, the trace shows exactly which span (engine CPU? Redis? fan-out?) is
responsible — instead of guessing.

## 5. Logging rules

- **Structured JSON only** (pino). No `console.log` in production code paths.
- Every log line carries `service`, `traceId`, `gameId`/`userId` where relevant.
- Log **levels**: error (paged), warn (reviewed), info (lifecycle), debug (off in prod).
- **Never log** secrets, private keys, full signatures, or PII beyond wallet address.
- Redact wallet-linked PII (email) in logs.

## 6. Health & readiness

Each service exposes:

- `GET /healthz` — process alive.
- `GET /readyz` — dependencies reachable (Redis, Postgres). The gateway's `readyz` **fails if Redis is
  down**, so the load balancer stops sending it new games (graceful degradation from
  [07](./07-data-layer.md#34-failure-behavior-graceful-degradation)).
- `/metrics` — Prometheus exposition.

## 7. Alerting (page vs notify)

| Severity | Examples | Channel |
| --- | --- | --- |
| **Page** (wake someone) | `settlement_pending` rising; error rate > 2%; Redis down; move p95 > 400 ms sustained; DB connections exhausted | PagerDuty/Opsgenie |
| **Notify** (Slack) | Queue depth elevated; reconnect rate up; one replica unhealthy | Slack |
| **Ticket** | Slow query trend; disk/memory creeping | Backlog |

Define **SLOs** (e.g. 99.9% availability, move p95 < 120 ms) and alert on **error budget burn**, not
raw thresholds, to reduce noise.

## 8. Load-test observability

Wire the same dashboards during load tests (see [delivery/03-testing-strategy.md](../delivery/03-testing-strategy.md))
so you find the ceiling in a test, not in production. The existing `stress-test/` suite becomes the
driver; Grafana shows where it breaks.

## 9. Definition of done (observability)

- [ ] OTel in every service; traces correlate a move across gateway→engine→Redis.
- [ ] Dashboards for the golden signals + product KPIs above.
- [ ] `settlement_pending` and error-rate alerts page on-call.
- [ ] `/healthz`, `/readyz`, `/metrics` on every service; structured pino logs, no secrets.
