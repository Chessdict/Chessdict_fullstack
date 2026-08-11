---
description: "Use when editing frontend / Next.js / React UI code (components, hooks, stores, pages). Enforces the three-state model, feature-first structure, and no-raw-socket-in-components rule."
applyTo: "apps/web/**,src/**/*.tsx,src/**/*.ts,src/components/**,src/app/**,src/hooks/**,src/stores/**"
---
# Frontend rules (Next.js + React)

Authoritative guide: [docs/architecture/01-frontend.md](../../docs/architecture/01-frontend.md).

## State: three kinds, one owner each
- **Server state** → TanStack Query (`useQuery`/`useMutation`). Never copy it into Zustand.
- **Realtime state** → Zustand `game-store`, written **only** by `use*Socket` hooks.
- **UI state** → local `useState` / tiny Zustand.

## Hard rules
- **No raw `socket.on` in components.** Subscribe inside a `use*Socket` hook that writes the store and
  cleans up listeners on unmount.
- Components ≤ ~300 lines, one responsibility. Break up big ones (extract clock, move-list, controls,
  dialogs; move logic to `lib/` and hooks). Do **not** add to the legacy 2,000-line `game-board.tsx`
  pattern — split instead.
- Realtime event payloads come from `packages/contracts` (Zod). Never invent inline shapes.
- Optimistic moves are validated locally with chess.js for feel, then **reconciled to server truth**;
  the server clock is the display source (count down to the server deadline).
- Server Components for read-heavy pages; Client Components only where interactivity requires it.
- Radix/shadcn primitives for standard UI; `sonner` for feedback (never `alert()`).
- Strict TS, no `any`; absolute imports (`@/…`); kebab-case files.
- Handle loading / empty / error states explicitly. Respect `prefers-reduced-motion`.

## Performance
- Route-level code splitting; lazy-load the board and heavy views.
- Memoize board squares; render only changed squares per move; throttle clock UI with rAF.
- One socket connection per tab (singleton). `next/image` for images.

## Done when
- No new raw `socket.on` in a component; state placed in the correct one of the three stores.
- New/changed components ≤ ~300 lines; inputs Zod-validated; tests for logic added.
