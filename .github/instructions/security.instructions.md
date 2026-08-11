---
description: "Use when working on auth, sessions, input validation, CORS, secrets, rate limiting, wallet/SIWE login, or any money/on-chain path. Enforces OWASP Top 10 controls, server-authoritative identity, and secret isolation for a real-money dApp."
applyTo: "src/auth.ts,src/middleware.ts,packages/auth/**,apps/web/src/app/api/**,apps/realtime-gateway/**,apps/workers/settlement/**"
---
# Security rules (real-money dApp)

Authoritative guides: [architecture/11](../../docs/architecture/11-security.md),
[08](../../docs/architecture/08-auth-identity.md).

## Identity & access
- **Server is authoritative.** Derive `userId`/`walletAddress` from the **verified session**, never from
  an event body or socket query param. Verify the session token at the Socket.IO handshake.
- Authorize **every** mutating action server-side (a player must belong to `game:{id}`; admin actions
  need a role claim). Defense in depth — never rely on a hidden client button.
- SIWE login: single-use nonce in Redis (short TTL); verify signature + domain + chainId; issue a
  stateless JWT; secure cookies (httpOnly, Secure, SameSite).

## Boundaries & input
- **Zod-parse every external input** (socket event, REST body, env, chain response). Reject malformed.
- Lock **CORS** to allowed origins (never `*`). Per-socket + global **rate limits**. Tighten payload
  size. Filter chat with `obscenity`; strip HTML.

## Secrets & keys
- Secrets in a manager, never in the repo or `NEXT_PUBLIC_*` (those are inlined into the client bundle).
- **Redeemer key only in `settlement-worker`**, ideally KMS. Never on web/gateway, never in CI, never
  logged. Least-privilege infra: each service gets only the secrets it needs.

## Money path
- Never pay without a validated game record; settlement idempotent + nonce-safe; contract reverts double
  settle. Audit-log all money movements; alert on `settlement_pending`.

## App hardening
- Security headers (CSP restricting script/connect-src to your origins + RPC + wallet; HSTS;
  X-Content-Type-Options; Referrer-Policy; frame-ancestors). Parameterized Prisma queries only.
- CI: Dependabot/Renovate, `npm audit`, gitleaks, Trivy (images), Slither (contracts).
- Never log secrets, private keys, full signatures, or PII beyond wallet address.

## Done when
- Identity from verified session; CORS locked; rate limits + Zod at boundaries; secrets isolated;
  money moves idempotent and audit-logged.
