import prisma from "@/lib/prisma";
import { getMemojiForAddress } from "@/lib/memoji";
import { getDisplayName } from "@/lib/utils";

export const EVENT_LEADERBOARD_TIME_ZONE = "Africa/Lagos";
export const EVENT_LOSS_SPOTLIGHT_MIN_GAMES = 6;
export const EVENT_LOSS_SPOTLIGHT_MAX_GAMES = 10;
export const EVENT_LEADERBOARD_WINDOW = {
  // 7:30 PM to 9:30 PM WAT on March 29, 2026. WAT is UTC+1.
  startUtc: new Date("2026-03-29T18:30:00.000Z"),
  endUtc: new Date("2026-03-29T20:30:00.000Z"),
  label: "March 29, 2026 · 7:30 PM - 9:30 PM WAT",
} as const;

export const MARCH_31_2026_STAKED_LEADERBOARD_WINDOW = {
  // 7:55 PM to 10:05 PM WAT on March 31, 2026. WAT is UTC+1.
  startUtc: new Date("2026-03-31T18:55:00.000Z"),
  endUtc: new Date("2026-03-31T21:05:00.000Z"),
  label: "March 31, 2026 · 7:55 PM - 10:05 PM WAT",
} as const;

type LeaderboardPlayer = {
  id: number;
  walletAddress: string;
  username: string | null;
  bulletRating: number;
  blitzRating: number;
  rapidRating: number;
  stakedRating: number;
};

type LeaderboardGame = {
  id: string;
  status: "COMPLETED" | "DRAW";
  onChainGameId: string | null;
  stakeToken: string | null;
  wagerAmount: number | null;
  updatedAt: Date;
  whitePlayer: LeaderboardPlayer | null;
  blackPlayer: LeaderboardPlayer | null;
  winnerId: number | null;
};

type AggregateEntry = {
  id: number;
  walletAddress: string;
  username: string | null;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  stakedGames: number;
  stakedWins: number;
  ratings: {
    bullet: number;
    blitz: number;
    rapid: number;
    staked: number;
  };
};

export type EventLeaderboardEntry = AggregateEntry & {
  displayName: string;
  memoji: string;
  winRate: number;
  adjustedLossRate: number;
};

export type EventLossSpotlightEntry = EventLeaderboardEntry;
export type TournamentLoserEntry = EventLeaderboardEntry;

function isStakedGame(game: Pick<LeaderboardGame, "onChainGameId" | "stakeToken" | "wagerAmount">) {
  return !!game.onChainGameId || !!game.stakeToken || game.wagerAmount != null;
}

function createEntry(player: LeaderboardPlayer): AggregateEntry {
  return {
    id: player.id,
    walletAddress: player.walletAddress,
    username: player.username,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    stakedGames: 0,
    stakedWins: 0,
    ratings: {
      bullet: player.bulletRating,
      blitz: player.blitzRating,
      rapid: player.rapidRating,
      staked: player.stakedRating,
    },
  };
}

function applyResult(
  entry: AggregateEntry,
  {
    didWin,
    isDraw,
    staked,
  }: {
    didWin: boolean;
    isDraw: boolean;
    staked: boolean;
  },
) {
  entry.games += 1;

  if (staked) {
    entry.stakedGames += 1;
  }

  if (isDraw) {
    entry.draws += 1;
    entry.points += 0.5;
    return;
  }

  if (didWin) {
    entry.wins += 1;
    entry.points += 1;
    if (staked) {
      entry.stakedWins += 1;
    }
    return;
  }

  entry.losses += 1;
}

export function buildEventLeaderboard(games: LeaderboardGame[]): EventLeaderboardEntry[] {
  const entries = new Map<number, AggregateEntry>();

  for (const game of games) {
    const staked = isStakedGame(game);
    const participants = [game.whitePlayer, game.blackPlayer].filter(
      (player): player is LeaderboardPlayer => !!player,
    );

    for (const player of participants) {
      if (!entries.has(player.id)) {
        entries.set(player.id, createEntry(player));
      }
    }

    const isDraw = game.status === "DRAW" || game.winnerId == null;

    for (const player of participants) {
      const entry = entries.get(player.id);
      if (!entry) continue;

      applyResult(entry, {
        didWin: !isDraw && player.id === game.winnerId,
        isDraw,
        staked,
      });
    }
  }

  return Array.from(entries.values())
    .sort((left, right) => {
      if (right.points !== left.points) return right.points - left.points;
      if (right.wins !== left.wins) return right.wins - left.wins;
      if (right.stakedWins !== left.stakedWins) return right.stakedWins - left.stakedWins;
      if (right.games !== left.games) return right.games - left.games;
      if (right.ratings.staked !== left.ratings.staked) {
        return right.ratings.staked - left.ratings.staked;
      }
      return left.walletAddress.localeCompare(right.walletAddress);
    })
    .map((entry) => ({
      ...entry,
      displayName: getDisplayName(entry.username, entry.walletAddress, "Player"),
      memoji: getMemojiForAddress(entry.walletAddress),
      winRate: entry.games > 0 ? Math.round((entry.wins / entry.games) * 100) : 0,
      // Bayesian-smoothed loss rate so tiny samples do not dominate.
      adjustedLossRate: (entry.losses + 3) / (entry.games + 6),
    }));
}

export function pickEventLossSpotlight(entries: EventLeaderboardEntry[]): EventLossSpotlightEntry | null {
  const eligibleEntries = entries.filter(
    (entry) =>
      entry.games >= EVENT_LOSS_SPOTLIGHT_MIN_GAMES &&
      entry.games <= EVENT_LOSS_SPOTLIGHT_MAX_GAMES &&
      entry.losses > 0,
  );

  if (eligibleEntries.length === 0) {
    return null;
  }

  return [...eligibleEntries].sort((left, right) => {
    if (right.adjustedLossRate !== left.adjustedLossRate) {
      return right.adjustedLossRate - left.adjustedLossRate;
    }
    if (right.losses !== left.losses) return right.losses - left.losses;
    if (right.games !== left.games) return right.games - left.games;
    return left.walletAddress.localeCompare(right.walletAddress);
  })[0];
}

export function pickTournamentLoser(entries: EventLeaderboardEntry[]): TournamentLoserEntry | null {
  if (entries.length === 0) {
    return null;
  }

  return [...entries].sort((left, right) => {
    if (right.losses !== left.losses) return right.losses - left.losses;
    if (left.wins !== right.wins) return left.wins - right.wins;
    if (left.points !== right.points) return left.points - right.points;
    if (right.games !== left.games) return right.games - left.games;
    return left.walletAddress.localeCompare(right.walletAddress);
  })[0];
}

function mapGameToLeaderboardGame(game: {
  id: string;
  status: "COMPLETED" | "DRAW";
  onChainGameId: string | null;
  stakeToken: string | null;
  wagerAmount: number | null;
  updatedAt: Date;
  whitePlayer:
    | {
        id: number;
        walletAddress: string | null;
        username: string | null;
        bulletRating: number;
        blitzRating: number;
        rapidRating: number;
        stakedRating: number;
      }
    | null;
  blackPlayer:
    | {
        id: number;
        walletAddress: string | null;
        username: string | null;
        bulletRating: number;
        blitzRating: number;
        rapidRating: number;
        stakedRating: number;
      }
    | null;
  winner?: { id: number } | null;
}): LeaderboardGame {
  return {
    id: game.id,
    status: game.status,
    onChainGameId: game.onChainGameId,
    stakeToken: game.stakeToken,
    wagerAmount: game.wagerAmount,
    updatedAt: game.updatedAt,
    whitePlayer: game.whitePlayer
      ? {
          ...game.whitePlayer,
          walletAddress: game.whitePlayer.walletAddress ?? "",
        }
      : null,
    blackPlayer: game.blackPlayer
      ? {
          ...game.blackPlayer,
          walletAddress: game.blackPlayer.walletAddress ?? "",
        }
      : null,
    winnerId: game.winner?.id ?? null,
  };
}

export async function getEventLeaderboard() {
  const games = await prisma.game.findMany({
    where: {
      status: {
        in: ["COMPLETED", "DRAW"],
      },
      updatedAt: {
        gte: EVENT_LEADERBOARD_WINDOW.startUtc,
        lt: EVENT_LEADERBOARD_WINDOW.endUtc,
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    include: {
      whitePlayer: {
        select: {
          id: true,
          walletAddress: true,
          username: true,
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
          bulletRating: true,
          blitzRating: true,
          rapidRating: true,
          stakedRating: true,
        },
      },
      winner: {
        select: {
          id: true,
        },
      },
    },
  });

  const leaderboard = buildEventLeaderboard(
    games.map((game) => mapGameToLeaderboardGame({
      ...game,
      status: game.status as "COMPLETED" | "DRAW",
    })),
  );

  return {
    window: EVENT_LEADERBOARD_WINDOW,
    totalGames: games.length,
    totalPlayers: leaderboard.length,
    entries: leaderboard,
    lossSpotlight: pickEventLossSpotlight(leaderboard),
  };
}

export async function getMarch31StakedLeaderboard() {
  const games = await prisma.game.findMany({
    where: {
      status: {
        in: ["COMPLETED", "DRAW"],
      },
      updatedAt: {
        gte: MARCH_31_2026_STAKED_LEADERBOARD_WINDOW.startUtc,
        lt: MARCH_31_2026_STAKED_LEADERBOARD_WINDOW.endUtc,
      },
      OR: [
        { onChainGameId: { not: null } },
        { stakeToken: { not: null } },
        { wagerAmount: { not: null } },
      ],
    },
    orderBy: {
      updatedAt: "desc",
    },
    include: {
      whitePlayer: {
        select: {
          id: true,
          walletAddress: true,
          username: true,
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
          bulletRating: true,
          blitzRating: true,
          rapidRating: true,
          stakedRating: true,
        },
      },
      winner: {
        select: {
          id: true,
        },
      },
    },
  });

  const leaderboard = buildEventLeaderboard(
    games.map((game) =>
      mapGameToLeaderboardGame({
        ...game,
        status: game.status as "COMPLETED" | "DRAW",
      }),
    ),
  );

  return {
    window: MARCH_31_2026_STAKED_LEADERBOARD_WINDOW,
    totalGames: games.length,
    totalPlayers: leaderboard.length,
    entries: leaderboard,
    loser: pickTournamentLoser(leaderboard),
  };
}
