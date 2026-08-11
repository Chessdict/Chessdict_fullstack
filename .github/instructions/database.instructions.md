---
description: "Use when editing database or cache code: Prisma schema/migrations, Postgres queries, or Redis key usage. Enforces indexing, pooling, read replicas, the Redis key catalog, and no authoritative state in memory."
applyTo: "packages/db/**,prisma/**,packages/redis-keys/**,**/*.prisma"
---
# Data layer rules (Postgres + Redis)

Authoritative guide: [architecture/07](../../docs/architecture/07-data-layer.md).

## Split of responsibility
- **Live/ephemeral truth → Redis** (game state, presence, matchmaking pools, clocks, locks, queues,
  leaderboards). **Permanent truth → Postgres.** Nothing authoritative in a process `Map`.

## Postgres / Prisma
- Index every foreign key and hot query column (game history, status, settlement sweep, ratings).
- **Connection pooling is mandatory** (PgBouncer / Prisma Accelerate / managed pooler). One Prisma
  client singleton per process with a bounded `connection_limit`.
- Reads use **replicas**; writes hit the primary. Keep writes off the hot path (defer via BullMQ).
- Migrations: Prisma Migrate, reviewed, **expand/contract** for zero-downtime. Run `migrate deploy` as a
  **release job**, not on every container boot. Never `db push` to prod; never drop a column in the
  same release that stops writing it.
- `select`/`include` only what's needed; paginate lists; no N+1.

## Redis
- Use the **key builders** in `packages/redis-keys` — never hand-format a key string. New key = new
  builder + a row in the key catalog table in architecture/07.
- Naming: `domain:identifier[:subkey]`, lower-case, colon-separated.
- Atomic multi-step mutations use **Lua** or `SET NX` locks — never read-modify-write across round
  trips.
- `maxmemory-policy` must not evict live games (`noeviction`/`volatile-ttl` on the state instance);
  AOF + backups on the state/queue instance. Trim streams with `MAXLEN`.
- Token amounts as string/BigInt; never floats.

## Done when
- Hot queries indexed; pooler in place; reads on replicas; writes deferred.
- All Redis access via `redis-keys` builders; new keys documented in the catalog.
