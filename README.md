# Chessdict

**Ultimate Chess Arena** — Challenge players around the world & earn rewards.

Whether you're a grandmaster or just getting started, Chessdict redefines how chess is played, owned, and experienced. Play real-time matches, stake tokens on games, and compete in tournaments — all on-chain.

## Features

- **Real-time multiplayer chess** — Socket.IO powered with server-authoritative timers
- **On-chain staking & wagers** — ERC20 token support on Base network
- **Stake-aware matchmaking** — Pairs players within ±10% wager range
- **Tournament system** — Round-robin format with sponsorship support
- **Elo rating system** — Dynamic ratings starting at 1200
- **Wallet-based authentication** — Connect with RainbowKit, no passwords needed
- **Game reconnection** — Rejoin in-progress games after disconnects
- **In-game chat** — Message your opponent during matches

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Radix UI, Framer Motion |
| **Backend** | Custom Node.js server, Socket.IO, Prisma ORM |
| **Database** | PostgreSQL (local), Redis (caching + Socket.IO adapter) |
| **Blockchain** | Wagmi, Viem, Ethers.js, RainbowKit, Solidity 0.8.20 (Foundry) |
| **State** | Zustand, React Query |
| **Testing** | Vitest |

## Prerequisites

- **Node.js** 18+
- **PostgreSQL** — running locally
- **Redis** — running locally

On macOS:

```bash
brew install postgresql redis
brew services start postgresql
brew services start redis
```

## Getting Started

### 1. Clone & install dependencies

```bash
git clone https://github.com/Chessdict/Chessdict_fullstack.git
cd Chessdict_fullstack
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in the values in `.env` (see [Environment Variables](#environment-variables) below).

### 3. Create database & run migrations

```bash
createdb chessdict
npm run db:migrate
```

### 4. Seed the database (optional)

```bash
npm run seed
```

### 5. Start the dev server

```bash
npm run dev
```

The app is now running at `http://localhost:3000`.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:migrate` | Create and apply database migrations |
| `npm run db:migrate:create` | Create a migration without applying it |
| `npm run db:migrate:deploy` | Apply pending migrations (CI/CD) |
| `npm run db:migrate:reset` | Reset database and re-apply all migrations |
| `npm run db:migrate:status` | Check migration status |
| `npm run db:push` | Push schema changes without creating a migration |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run seed` | Seed the database |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |

## Project Structure

```
.
├── src/
│   ├── app/                  # Next.js App Router (pages & API routes)
│   ├── components/           # React components (game/, tournament/, ui/)
│   ├── hooks/                # Custom hooks (useSocket, useChessdict)
│   ├── lib/                  # Utilities (prisma, redis, contract ABIs)
│   ├── providers/            # Context providers (wallet, react-query)
│   └── stores/               # Zustand stores (game, tournament)
├── lib/                      # Server-side utilities (matchmaking, redis)
├── prisma/
│   ├── schema.prisma         # Database schema
│   ├── migrations/           # SQL migration files
│   └── seed.ts               # Database seed script
├── chessdict-contracts/      # Solidity smart contracts (Foundry)
├── server.mjs                # Custom HTTP + Socket.IO server
└── package.json
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string (defaults to `redis://localhost:6379`) |
| `AUTH_SECRET` | NextAuth secret (generate with `npx auth secret`) |
| `AUTH_GITHUB_ID` | GitHub OAuth app client ID (optional) |
| `AUTH_GITHUB_SECRET` | GitHub OAuth app client secret (optional) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID |
| `NEXT_PUBLIC_NETWORK` | `mainnet` (Base) or `testnet` (Base Sepolia) |
| `REDEEMER_PRIVATE_KEY` | Server wallet key for on-chain settlement (optional) |
| `RPC_URL` | RPC endpoint for on-chain transactions |
