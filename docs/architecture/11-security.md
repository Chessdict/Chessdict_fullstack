# 11 — Security Hardening

> **Scope:** the security baseline for a real-money dApp. Covers OWASP Top 10, realtime, and web3.
> **Governing instructions:**
> [`.github/instructions/security.instructions.md`](../../.github/instructions/security.instructions.md).

---

## 1. Immediate fixes from the current code

| Issue | Location | Fix |
| --- | --- | --- |
| `cors: { origin: "*" }` on Socket.IO | `server.mjs` | Allow-list exact origins; credentials-aware CORS |
| Trusting `userId` from socket query/body | `useSocket`, handlers | Verify signed session at handshake ([08](./08-auth-identity.md)) |
| Redeemer private key in app env, inline signing on public box | `server.mjs` | Move to `settlement-worker` + KMS ([06](./06-blockchain-settlement.md)) |
| No per-socket rate limiting | gateway | Token-bucket per socket/IP |
| No input schema at boundaries | handlers | Zod-validate every event/route |

## 2. OWASP Top 10 mapping

| Risk | Control in this design |
| --- | --- |
| **A01 Broken Access Control** | Server-side authorization on every action; identity from verified session, never client input; players re-checked against `game:{id}` |
| **A02 Cryptographic Failures** | TLS everywhere; secrets in a manager; JWT signed with rotated `AUTH_SECRET`; no secrets in `NEXT_PUBLIC_*` |
| **A03 Injection** | Prisma parameterized queries (no raw SQL with interpolation); Zod at boundaries; escape user chat |
| **A04 Insecure Design** | This document set; threat-modeled money path; idempotent settlement |
| **A05 Security Misconfiguration** | Locked CORS; security headers (CSP, HSTS, X-Frame-Options); least-privilege infra; no default creds |
| **A06 Vulnerable Components** | `npm audit`/**Dependabot**/Renovate in CI; pin versions; SBOM |
| **A07 Auth Failures** | SIWE nonce single-use; rate-limited login; short JWT TTL; secure cookies (httpOnly, Secure, SameSite) |
| **A08 Data Integrity Failures** | Signed sessions; contract events verified; CI artifact integrity; lockfile |
| **A09 Logging/Monitoring Failures** | [Observability](./10-observability.md): structured logs, alerts, audit trail for money moves |
| **A10 SSRF** | No user-controlled server-side fetches; RPC/OAuth URLs are fixed config |

## 3. Realtime-specific

- **Rate limits:** per-socket token bucket for `movePiece`, `chatMessage`, `joinSpectatorRoom`; global
  connection rate limit at the LB. Blunts event-flood and reconnect-storm (mirror the existing
  `stress-test/03` and `04` scenarios in tests).
- **Payload limits:** tighten `maxHttpBufferSize`; reject oversized/malformed via Zod.
- **Room authorization:** verify membership before any room emit (the current `roomAccessDenied`
  pattern — keep and enforce everywhere).
- **Chat safety:** keep `obscenity` filtering; strip HTML; length-limit.
- **Anti-cheat:** server-authoritative moves + clocks; one active game per wallet ([04](./04-game-engine-state.md#7-anti-cheat--integrity)).

## 4. Web3 & settlement

- **Key isolation:** redeemer key only in `settlement-worker`, ideally KMS/hardware signer — never in
  web/gateway, never in the client bundle.
- **Least privilege on-chain:** redeemer can only settle; consider **multisig/timelock** for
  owner/admin functions (fees, token list, redeemer changes).
- **Idempotent, verified payouts:** never pay without a validated game record; contract reverts double
  settle ([06](./06-blockchain-settlement.md)).
- **Reentrancy & token safety:** `Chessdict.sol` uses `SafeERC20`, checks-effects-interactions, and a
  supported-token allow-list — keep and cover with Foundry tests (including malicious-token cases).
- **Front-running / MEV:** settlement is oracle-driven (redeemer), not user-triggered value extraction,
  which limits MEV surface; still, avoid encoding exploitable ordering assumptions.
- **Audit:** budget an external smart-contract audit before scaling stakes; run Slither/Foundry
  invariant tests in CI.

## 5. Application hardening

- **Security headers** via Next.js middleware/`next.config`: CSP (restrict script/connect-src to your
  origins + RPC + wallet), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, frame-ancestors.
- **CSRF:** SameSite cookies + double-submit token for state-changing HTTP routes; Server Actions carry
  their own protection — keep them scoped and authorized.
- **Secrets scanning:** gitleaks/trufflehog in CI; block merges that add secrets.
- **Dependency & container scanning:** Dependabot/Renovate + Trivy on images.
- **Least privilege infra:** each service gets only the env/secrets it needs (only the worker sees the
  redeemer key; only web sees OAuth secrets).

## 6. Data protection & privacy

- Minimize PII (wallet address is pseudonymous; email optional and encrypted/limited).
- Redact PII from logs; scope DB access; encrypt at rest (managed providers do this) and in transit.
- Define data retention (finished games kept; ephemeral keys TTL'd) and a deletion path for user data
  requests.

## 7. Definition of done (security)

- [ ] CORS allow-listed; per-socket + global rate limits live; Zod at every boundary.
- [ ] Socket identity from verified session; no client-supplied identity trusted.
- [ ] Redeemer key isolated to worker/KMS; contract audited path; double-settle impossible.
- [ ] Security headers, secret scanning, dependency/container scanning in CI.
- [ ] Audit log for all money movements; alerts wired ([10](./10-observability.md)).
