import "server-only";

import prisma from "@/lib/prisma";
import { getMemojiForAddress } from "@/lib/memoji";
import { getAllRatings, getPlayerRatingForTimeControl } from "@/lib/player-ratings";
import { getDisplayName } from "@/lib/utils";

const PUBLIC_LIVE_ACTIVITY_WINDOW_MS = 1000 * 60 * 60;
const WAT_OFFSET_HOURS = 1;

export type PublicProfileGame = {
  id: string;
  result: "win" | "loss" | "draw";
  playedAs: "white" | "black";
  opponentAddress: string;
  opponentUsername: string | null;
  opponentRating: number;
  timeControl: number;
  isStaked: boolean;
  wagerAmount: number | null;
  date: string;
};

export type PublicPlayerProfile = {
  walletAddress: string;
  username: string | null;
  displayName: string;
  memoji: string;
  ratings: {
    bullet: number;
    blitz: number;
    rapid: number;
    staked: number;
  };
  joinedAt: string;
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  totalStakedAmount: number;
  winRate: number;
  recentGames: PublicProfileGame[];
};

export type PublicGameActivitySummary = {
  liveNow: number;
  livePlayers: number;
  finishedToday: number;
  startUtc: string;
  endUtc: string;
  label: string;
};

function getWatTodayWindow(now = new Date()) {
  const offsetMs = WAT_OFFSET_HOURS * 60 * 60 * 1000;
  const shifted = new Date(now.getTime() + offsetMs);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const date = shifted.getUTCDate();
  const startUtc = new Date(Date.UTC(year, month, date) - offsetMs);
  const endUtc = new Date(Date.UTC(year, month, date + 1) - offsetMs);

  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  return { startUtc, endUtc, label };
}

async function findPublicUser(identifier: string) {
  const trimmed = decodeURIComponent(String(identifier ?? "")).trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase();

  return prisma.user.findFirst({
    where: trimmed.startsWith("0x")
      ? {
          walletAddress: {
            equals: trimmed,
            mode: "insensitive",
          },
        }
      : {
          OR: [
            { username: normalized },
            {
              walletAddress: {
                equals: trimmed,
                mode: "insensitive",
              },
            },
          ],
        },
    select: {
      id: true,
      walletAddress: true,
      username: true,
      rating: true,
      bulletRating: true,
      blitzRating: true,
      rapidRating: true,
      stakedRating: true,
      createdAt: true,
    },
  });
}

export async function getPublicPlayerProfile(identifier: string): Promise<PublicPlayerProfile | null> {
  const user = await findPublicUser(identifier);
  if (!user) return null;

  const [totalGames, wins, draws, stakedTotals, games] = await Promise.all([
    prisma.game.count({
      where: {
        status: { in: ["COMPLETED", "DRAW"] },
        OR: [{ whitePlayerId: user.id }, { blackPlayerId: user.id }],
      },
    }),
    prisma.game.count({
      where: { status: "COMPLETED", winnerId: user.id },
    }),
    prisma.game.count({
      where: {
        status: { in: ["COMPLETED", "DRAW"] },
        winnerId: null,
        OR: [{ whitePlayerId: user.id }, { blackPlayerId: user.id }],
      },
    }),
    prisma.game.aggregate({
      where: {
        status: { in: ["COMPLETED", "DRAW"] },
        wagerAmount: { not: null },
        OR: [{ whitePlayerId: user.id }, { blackPlayerId: user.id }],
      },
      _sum: {
        wagerAmount: true,
      },
    }),
    prisma.game.findMany({
      where: {
        status: { in: ["COMPLETED", "DRAW"] },
        OR: [{ whitePlayerId: user.id }, { blackPlayerId: user.id }],
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: {
        whitePlayer: {
          select: {
            id: true,
            walletAddress: true,
            username: true,
            rating: true,
            bulletRating: true,
            blitzRating: true,
            rapidRating: true,
            stakedRating: true,
          },
        },
        blackPlayer: {
          select: {
            id: true,
            walletAddress: true,
            username: true,
            rating: true,
            bulletRating: true,
            blitzRating: true,
            rapidRating: true,
            stakedRating: true,
          },
        },
      },
    }),
  ]);

  const losses = totalGames - wins - draws;
  const walletAddress = user.walletAddress ?? "";

  return {
    walletAddress,
    username: user.username,
    displayName: getDisplayName(user.username, walletAddress, "Player"),
    memoji: getMemojiForAddress(walletAddress),
    ratings: getAllRatings(user),
    joinedAt: user.createdAt.toISOString(),
    totalGames,
    wins,
    losses,
    draws,
    totalStakedAmount: stakedTotals._sum.wagerAmount ?? 0,
    winRate: totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0,
    recentGames: games.map((game) => {
      const isWhite = game.whitePlayerId === user.id;
      const opponent = isWhite ? game.blackPlayer : game.whitePlayer;
      const result = !game.winnerId
        ? ("draw" as const)
        : game.winnerId === user.id
          ? ("win" as const)
          : ("loss" as const);

      return {
        id: game.id,
        result,
        playedAs: isWhite ? ("white" as const) : ("black" as const),
        opponentAddress: opponent?.walletAddress ?? "",
        opponentUsername: opponent?.username ?? null,
        opponentRating: getPlayerRatingForTimeControl(
          opponent,
          game.timeControl,
          !!game.onChainGameId || !!game.stakeToken || game.wagerAmount != null,
        ),
        timeControl: game.timeControl,
        isStaked: !!game.onChainGameId || !!game.stakeToken || game.wagerAmount != null,
        wagerAmount: game.wagerAmount ?? null,
        date: game.updatedAt.toISOString(),
      };
    }),
  };
}

export async function getPublicGameActivitySummary(): Promise<PublicGameActivitySummary> {
  const { startUtc, endUtc, label } = getWatTodayWindow();

  const [liveGames, finishedToday] = await Promise.all([
    prisma.game.findMany({
      where: {
        status: "IN_PROGRESS",
        updatedAt: { gte: new Date(Date.now() - PUBLIC_LIVE_ACTIVITY_WINDOW_MS) },
      },
      select: {
        whitePlayerId: true,
        blackPlayerId: true,
      },
    }),
    prisma.game.count({
      where: {
        status: { in: ["COMPLETED", "DRAW"] },
        updatedAt: {
          gte: startUtc,
          lt: endUtc,
        },
      },
    }),
  ]);

  const livePlayers = new Set<number>();
  for (const game of liveGames) {
    if (typeof game.whitePlayerId === "number") livePlayers.add(game.whitePlayerId);
    if (typeof game.blackPlayerId === "number") livePlayers.add(game.blackPlayerId);
  }

  return {
    liveNow: liveGames.length,
    livePlayers: livePlayers.size,
    finishedToday,
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
    label,
  };
}
