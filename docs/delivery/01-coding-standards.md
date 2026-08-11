# Coding Standards

> **Scope:** the one documented way to write Chessdict code. This extends the team's existing
> `.cursorrules` (KISS/DRY/YAGNI) and is the human-readable source that the LLM guides in
> [`.github/`](../../.github) enforce. **If it's not written here, don't invent a second way to do it.**

---

## 1. Language & types

- **TypeScript everywhere**, `strict: true`. **No `any`** — use `unknown` + narrowing, generics, or a
  proper type. `any` in a PR is a review block.
- Prefer **`type`** for data shapes, `interface` for extensible contracts. Export types from
  `packages/contracts` / package barrels, not ad hoc.
- **Zod is the boundary.** Every external input (socket event, REST body, env var, chain response) is
  parsed with a Zod schema; the inferred type is the TS type. Never hand-write a type that duplicates a
  Zod schema.
- No implicit `any` from untyped libs — wrap them.

## 2. Naming & files

- **kebab-case** file names (`game-board.tsx`) — matches current convention.
- Components `PascalCase`; hooks `useX`; functions/vars `camelCase`; constants `UPPER_SNAKE`; types
  `PascalCase`.
- **Absolute imports** (`@/…`, `@chessdict/contracts`) — never `../../../`.
- One primary export per file; **files ≤ ~300 lines** (hard signal to split, esp. React components).

## 3. Architecture rules (the anti-spaghetti rules)

- **Respect the service boundaries** in [00-target-repo-structure.md](./00-target-repo-structure.md).
  Apps import only from `packages/*`; never app→app.
- **No authoritative state in process memory.** No `Map`/`Set`/module-global holding game/session/queue
  truth. Live state → Redis (via `packages/redis-keys`), permanent → Postgres.
- **No `setTimeout`/`setInterval` for game logic.** Deadlines → scheduler jobs
  ([04](../architecture/04-game-engine-state.md#4-the-clock-server-authoritative-deadline-based)).
- **No blocking work on the hot path.** Settlement, ratings, persistence, notifications → BullMQ jobs
  (idempotent, keyed by `gameId`).
- **Server is authoritative.** Never trust client-sent identity, FEN, or clock for truth.
- **One Prisma client per process** (singleton); reads via replica where applicable.

## 4. React / frontend

- Follow [01-frontend.md](../architecture/01-frontend.md): three state kinds (server = TanStack Query,
  realtime = Zustand `game-store`, UI = local). Never copy server state into Zustand.
- **No raw `socket.on` in components** — only inside a `use*Socket` hook.
- Server Components for read-heavy pages; Client Components only where interactivity needs it.
- Radix/shadcn primitives for all standard UI (modals, toasts, inputs). `sonner` for feedback, never
  `alert()`.
- Handle loading / empty / error states explicitly.

## 5. Errors & results

- **Fail fast at boundaries** (Zod parse throws → mapped to a typed error response). Do **not** add
  defensive `try/catch` for impossible states inside the core.
- Use a consistent error shape across REST + socket (`{ code, message }` from `packages/contracts`).
- Async jobs: throw to trigger BullMQ retry; make handlers **idempotent** so retries are safe.
- Log errors with context (`traceId`, `gameId`) via pino; never swallow silently; never log secrets.

## 6. Async & concurrency

- `async/await` only; no floating promises (lint rule). Handle or explicitly `void` fire-and-forget
  (and prefer a queue over fire-and-forget for anything important).
- Mutations to shared Redis state that must be atomic use **Lua scripts** or `SET NX` locks — never
  read-modify-write across two round trips.
- Parallelize independent I/O with `Promise.all`; never serialize independent DB calls (the current
  `updateRatings` anti-pattern).

## 7. Data & queries

- Prisma: typed queries only; `select`/`include` exactly what's needed (no over-fetching); paginate
  lists. Index every hot query ([07](../architecture/07-data-layer.md#22-indexing-add-these)).
- Redis: use the **key builders** in `packages/redis-keys` — never hand-format a key string. New key =
  new builder + a row in the key catalog.
- Money math: never use floats for token amounts on-chain paths — use BigInt/strings (the schema
  already stores `stakeAmount` as string; keep that discipline).

## 8. Solidity (see [solidity.instructions.md](../../.github/instructions/solidity.instructions.md))

- Foundry; `forge fmt`; checks-effects-interactions; `SafeERC20`; explicit visibility; custom errors
  over `require` strings; events on every state change; full test coverage incl. revert paths.

## 9. Comments & docs

- Comment **why**, not **what**. One short line where the code can't speak for itself. No restating the
  next line; no multi-paragraph essays.
- Update the relevant `docs/` page and diagram **in the same PR** as an architectural change.

## 10. Formatting & lint

- Prettier + ESLint (`eslint-config-next` + import/order + no-floating-promises + no-restricted-imports
  to block app→app). CI enforces; no manual style debates.
- Conventional Commits (`feat:`, `fix:`, `refactor:`…) for readable history + changesets.

## 11. Quick "don't do this" list (the exact things that caused the mess)

| ❌ Don't | ✅ Do |
| --- | --- |
| Put state in a `Map` in a service | Store it in Redis via `redis-keys` |
| `setTimeout` a game clock | Schedule a deadline job |
| `socket.on` inside a component | Subscribe in a `use*Socket` hook |
| Fire-and-forget an on-chain tx | Enqueue an idempotent settlement job |
| Add a 2,000-line component | Split at ~300 lines, extract hooks/lib |
| Invent a new event payload inline | Add it to `packages/contracts` (Zod) |
| Trust `userId` from the client | Derive identity from the verified session |
| `any` to make TS quiet | Model the type / parse with Zod |

## 12. Definition of done (any PR)

- [ ] Matches these standards and the relevant `docs/` architecture doc.
- [ ] Strict TS, no `any`; Zod at boundaries; no app→app imports.
- [ ] No new process-memory state, no game-logic `setTimeout`, no raw `socket.on` in components.
- [ ] Tests added/updated; lint/types/tests green; docs+diagram updated if design changed.
