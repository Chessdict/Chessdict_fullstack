# 07 — Data Layer (PostgreSQL + Redis)

> **Scope:** the two stores that everything else depends on. Get this right and the rest scales.
> **Diagram:** [data-layer.drawio](../diagrams/data-layer.drawio). **Governing instructions:**
> [`.github/instructions/database.instructions.md`](../../.github/instructions/database.instructions.md).

---

## 1. Division of responsibility

| | PostgreSQL (system of record) | Redis / Dragonfly (live + ephemeral) |
| --- | --- | --- |
| Holds | Users, finished games, ratings, tournaments, challenges, settlement outbox | Live game state, clocks, presence, matchmaking pools, queues, locks, leaderboards, cache |
| Consistency | Strong, durable, transactional | Fast, mostly-atomic, TTL'd |
| On hot path? | **No** (writes deferred via queue) | **Yes** (every move touches Redis) |
| Scale by | Read replicas + pooling | More memory / Dragonfly / Cluster |

Golden rule (again): **live truth in Redis, permanent truth in Postgres, nothing authoritative in a
process `Map`.**

## 2. PostgreSQL

### 2.1 Keep Prisma, tighten the schema

The existing `schema.prisma` (User, Account, Session, Game, OpenChallenge, Tournament,
TournamentParticipant, TournamentMatch) is solid. Additions for the rebuild:

- `SettlementOutbox` model (see [06](./06-blockchain-settlement.md)) — durable payout intents.
- `RatingApplied`/idempotency markers, or a unique constraint keyed by `gameId`, so rating and
  settlement jobs are exactly-once.
- Ensure every foreign-key and hot query column is **indexed** (see below).

### 2.2 Indexing (add these)

| Query | Index |
| --- | --- |
| Player game history | `Game(whitePlayerId, createdAt)`, `Game(blackPlayerId, createdAt)` |
| Active/waiting games | `Game(status)` (partial: `WHERE status IN ('WAITING','IN_PROGRESS')`) |
| Leaderboard fallback | `User(blitzRating)`, `User(bulletRating)`, `User(rapidRating)`, `User(stakedRating)` |
| Open challenges | already has `@@index([status, expiresAt])` — keep |
| Settlement sweep | `SettlementOutbox(status, createdAt)` |
| Wallet lookups | `User.walletAddress @unique` — keep |

### 2.3 Connection pooling (mandatory at scale)

Serverless/many-instance deployments exhaust Postgres connections fast. **Never** point N app instances
straight at Postgres. Use one of:

- **PgBouncer** (transaction pooling) in front of Postgres, or
- **Prisma Accelerate** / **Neon serverless driver** (built-in pooling), or
- The managed provider's pooler (Neon, Supabase both provide one).

Prisma clients should be **singletons per process** with a bounded `connection_limit`. This alone
prevents a common "database has too many clients" outage.

### 2.4 Read replicas

Reads (profiles, history, leaderboard fallback, admin) go to **read replicas**; only writes hit the
primary. With moves living in Redis, the primary's write volume is low (game-end persistence, matches,
rating updates), so **1 primary + 1–2 replicas** covers 10k CCU comfortably.

### 2.5 Migrations & safety

- Keep Prisma Migrate; every change is a reviewed migration (never `db push` to production).
- **Expand/contract** for zero-downtime: add nullable column → backfill → switch code → drop old, across
  separate deploys. Never drop a column in the same release that stops writing it.
- `db:migrate:deploy` runs in CI/CD before the new version takes traffic (the Dockerfile already does
  `prisma migrate deploy` — move it into a **release step**, not every container boot, once you run many
  replicas, so N containers don't race the same migration).

## 3. Redis / Dragonfly

### 3.1 Engine choice

- Start on **managed Redis 7** (Upstash for pay-per-use, or ElastiCache/Memorystore).
- If a single node's throughput becomes the ceiling, move to **Dragonfly** (drop-in Redis wire
  protocol, multi-threaded, much higher ops/sec per node — often avoids clustering entirely) or **Redis
  Cluster**.

### 3.2 Key catalog (authoritative — LLMs and devs must reuse these, not invent new ones)

| Purpose | Key | Type | TTL |
| --- | --- | --- | --- |
| Live game state | `game:{id}` | Hash | 4 h after end |
| Move list | `game:{id}:moves` | List | with game |
| Presence | `presence:{userId}` | Hash | heartbeat (~60 s) |
| Active game for user | `activegame:{userId}` | String(JSON) | 4 h |
| Matchmaking pool | `mm:{mode}:{tc}` / `mm:staked:{token}:{tc}` | Sorted set | until matched |
| Matchmaking meta | `mm:meta:{userId}` | Hash | short |
| Clock deadline | `clock:{gameId}` | String | per turn |
| Recently completed guard | `completed:{gameId}` | String | ~10 s |
| Per-game write lock | `lock:game:{id}` | String (NX) | ~2 s |
| Signer nonce lock | `lock:signer:{addr}` | String (NX) | seconds |
| Leaderboard | `leaderboard:{category}` | Sorted set | rebuilt |
| Rate-limit buckets | `rl:{scope}:{id}` | String/Hash | window |
| BullMQ | `bull:{queue}:*` | (managed by BullMQ) | — |
| Socket.IO Streams adapter | `socket.io#/#…` | Stream | trimmed |

> **Naming convention:** `domain:identifier[:subkey]`, lower-case, colon-separated. Adding a new key
> means adding a row here in the same PR.

### 3.3 Memory & durability policy

- **Separate concerns by instance if possible:** queues/streams (BullMQ, Socket.IO adapter) can be
  memory-heavy and benefit from different persistence than the game-state cache. At minimum, set an
  appropriate `maxmemory-policy`:
  - Game/live state DB: `noeviction` or `volatile-ttl` (do **not** silently evict a live game).
  - Pure cache (leaderboard, rendered fragments): `allkeys-lru` is fine.
- **Persistence:** enable AOF (everysec) for the queue/state instance so a restart doesn't lose
  in-flight jobs; the repo currently has a `dump.rdb` (RDB snapshot) — fine for dev, but production
  needs AOF + managed backups.
- **Sizing:** a live game hash is small (< ~4 KB). 5,000 concurrent games ≈ tens of MB of game state;
  presence + pools + queues add more. Even 20k burst fits comfortably in a few GB — Redis memory is not
  the constraint; ops/sec is, which is why Dragonfly/Cluster is the scale lever.

### 3.4 Failure behavior (graceful degradation)

The current `redis.mjs` already wraps reads/writes in `safeRedisRead/Write` with fallbacks — keep that
philosophy, but with externalized state the rule sharpens: **a Redis outage should pause new-game
creation and surface a clear "reconnecting" state, not silently run games in local memory** (which can't
work across instances). Health checks fail fast; the load balancer stops routing new games until Redis
is back; in-flight clients auto-resync on recovery.

## 4. Caching strategy

| Data | Cache | Invalidation |
| --- | --- | --- |
| Leaderboard | Redis ZSET + CDN fragment | on rating write / short TTL |
| Public profiles | Redis string + `stale-while-revalidate` | on profile update |
| Chessdicts/static content | CDN + RSC cache | on content change |
| Session/JWT | stateless (no server cache) | expiry |

Prefer **read-through** caching with short TTLs over manual invalidation where correctness allows; use
explicit invalidation only for user-visible writes (profile, rating).

## 5. Data lifecycle

- Live game hash → expires 4 h after completion; the permanent record is the Postgres `Game` row +
  PGN.
- Presence/matchmaking keys → TTL/heartbeat cleanup.
- Outbox rows → retained (audit); archived after settlement + retention window.
- Old finished games → keep in Postgres; consider partitioning `Game` by month if volume grows.

## 6. Definition of done (data layer)

- [ ] Every hot query indexed; connection pooling (PgBouncer/Accelerate/managed) in front of Postgres.
- [ ] Reads use replicas; writes deferred off the hot path via queues.
- [ ] All Redis keys follow the catalog; new keys added to the table in the same PR.
- [ ] `maxmemory-policy` set so live games are never evicted; AOF + backups on the state/queue instance.
- [ ] Migrations run as a release step, not a per-container race.
