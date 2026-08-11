# Cost Model

> **Scope:** ballpark monthly infrastructure cost to run Chessdict at the target load, with a lean
> starter tier and a scale-up tier. **These are planning estimates** (2025-era public pricing) to guide
> decisions — always confirm against live pricing and your real usage. Prices in USD/month.

---

## 1. Philosophy: pay for load, not for idle

The architecture is deliberately made of **small, independently scalable containers** so you run few
replicas at low traffic and scale out only when needed. Managed Postgres/Redis start cheap
(pay-per-use) and graduate to dedicated instances as CCU grows. This keeps early-stage burn low while
preserving the 10k+ ceiling.

## 2. Three tiers

### Tier A — Lean / pre-launch (hundreds of CCU)

For daily development, testing, and a small beta. Mostly free tiers.

| Item | Choice | Est. $/mo |
| --- | --- | --- |
| Containers (web+gateway+engine+workers, minimal replicas) | Fly.io / Railway small machines | 20–60 |
| Postgres | Neon free/launch | 0–20 |
| Redis | Upstash pay-as-you-go | 0–10 |
| CDN/WAF | Cloudflare free | 0 |
| Observability | Grafana Cloud free + Sentry free | 0 |
| RPC | Alchemy free tier | 0 |
| **Total** | | **~$20–100** |

### Tier B — Launch / 10,000 CCU (the target)

| Item | Config | Est. $/mo |
| --- | --- | --- |
| realtime-gateway | 3 × (2 vCPU/2 GB) | 90–150 |
| web | 3–4 × (1 vCPU/1 GB) | 60–120 |
| game-engine | 2 × (2 vCPU/2 GB) | 60–100 |
| matchmaking + scheduler | 4 × (1 vCPU/512 MB) | 40–80 |
| workers (rating/persist/notify/settlement/tournament) | ~10 small | 80–160 |
| **Compute subtotal** | ~22–24 small containers | **~330–610** |
| Redis/Dragonfly | dedicated primary+replica (or Upstash pro / Dragonfly Cloud) | 100–300 |
| Postgres | Neon/Supabase scale + 1–2 replicas + pooler | 100–300 |
| CDN/WAF/bandwidth | Cloudflare Pro + egress | 20–100 |
| Object storage | R2/S3 | 5–20 |
| Observability | Grafana Cloud + Sentry (paid) | 50–200 |
| RPC | Alchemy/Infura growth tier | 50–200 |
| Secrets/KMS | KMS + secrets | 5–20 |
| **Total** | | **~$700–1,900/mo** |

> **Reading this:** a well-architected 10k-CCU chess dApp lands roughly **$1–2k/month** — not
> tens of thousands. The original monolith couldn't reach this load *at any price* because it couldn't
> scale horizontally; the cost problem was really an architecture problem.

### Tier C — Scale-up / 20k+ CCU on AWS

| Item | Config | Est. $/mo |
| --- | --- | --- |
| ECS Fargate (all services, more replicas) | ~30–40 tasks | 1,000–2,500 |
| ElastiCache (Redis/Dragonfly), Multi-AZ | dedicated | 300–800 |
| RDS/Aurora Postgres + replicas | Multi-AZ | 300–900 |
| ALB/NLB + data transfer | sticky WS | 100–400 |
| CloudFront/Cloudflare + WAF | edge | 50–300 |
| Observability (self-host LGTM or Datadog) | | 100–800 |
| RPC (higher tier) | | 200–500 |
| **Total** | | **~$2,000–6,000/mo** |

## 3. Cost drivers & levers

| Driver | Why it costs | Lever to control it |
| --- | --- | --- |
| **Redis ops/sec** | Every move + fan-out hits Redis | Dragonfly (more ops/$/node); split adapter vs state; trim streams (`MAXLEN`) |
| **WebSocket bandwidth/egress** | Persistent connections + move fan-out | Compact payloads (Zod, no bloat); CDN for everything static; pick egress-friendly providers (R2) |
| **Container count** | Over-provisioned replicas | Autoscale with scale-in; right-size CPU/RAM; scale-to-min off-peak |
| **RPC calls** | Settlement + reads | Batch reads; cache chain reads; only settle on game-end (already the case) |
| **Postgres** | Connections + storage | Pooler (avoid over-provisioning); replicas for reads; archive old games |
| **Observability** | Log/metric volume | Sample traces; keep debug logs off in prod; short retention |

## 4. Free/open-source that keeps cost down

Everything core is open source and self-hostable if you outgrow managed pricing: **Redis/Dragonfly,
PostgreSQL, BullMQ, Socket.IO, Prometheus/Grafana/Loki/Tempo, OpenTelemetry, Next.js, Foundry**. You
pay for *convenience* (managed) not *licenses* — so you can always trade money for ops effort in either
direction.

## 5. Cost guardrails

- Set **budget alerts** on every provider.
- Dashboard **$ per 1k CCU** as a unit-economics metric; watch it trend.
- Scale non-prod environments to zero when idle.
- Reserve/committed-use discounts once steady-state load is known (AWS Savings Plans, etc.).

## 6. Definition of done (cost)

- [ ] Budget alerts on all providers; unit-cost ($/1k CCU) tracked on a dashboard.
- [ ] Autoscale scale-in verified; non-prod scales to zero off-hours.
- [ ] Redis/egress (the top drivers) actively monitored with the levers above documented for on-call.
