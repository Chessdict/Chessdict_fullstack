"use server";

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { containsProfanity } from "@/lib/utils";
import { getAllRatings, getPlayerRatingForTimeControl } from "@/lib/player-ratings";
import { getPublicGameSnapshot } from "@/lib/server/public-game";
import {
  clampStakedTimeControlMinutes,
  normalizeTimeControlMinutes,
} from "@/lib/time-control";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const OPEN_CHALLENGE_TTL_MS = 1000 * 60 * 60 * 3;
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeUsernameInput(username: unknown) {
  const normalized = String(username ?? "").trim().toLowerCase();
  if (!normalized) return "";
  return normalized;
}

function normalizeStakeAmountString(value: unknown) {
  const numericAmount = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return null;
  return String(numericAmount);
}

function normalizeEmailInput(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

async function serializeOpenChallenge(challenge: {
  id: string;
  status: "OPEN" | "ACCEPTED" | "CANCELLED" | "EXPIRED";
  timeControl: number;
  staked: boolean;
  stakeToken: string | null;
  stakeAmount: string | null;
  roomId: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  creator: { walletAddress: string };
  acceptedBy: { walletAddress: string } | null;
}) {
  const game = challenge.roomId
    ? await prisma.game.findUnique({
        where: { id: challenge.roomId },
        select: {
          status: true,
          onChainGameId: true,
        },
      })
    : null;

  return {
    id: challenge.id,
    status: challenge.status,
    timeControl: normalizeTimeControlMinutes(challenge.timeControl),
    staked: challenge.staked,
    stakeToken: challenge.stakeToken,
    stakeAmount: challenge.stakeAmount,
    roomId: challenge.roomId,
    gameStatus: game?.status ?? null,
    onChainGameId: game?.onChainGameId ?? null,
    expiresAt: challenge.expiresAt.toISOString(),
    acceptedAt: challenge.acceptedAt?.toISOString() ?? null,
    cancelledAt: challenge.cancelledAt?.toISOString() ?? null,
    createdAt: challenge.createdAt.toISOString(),
    creatorAddress: challenge.creator.walletAddress,
    acceptedByAddress: challenge.acceptedBy?.walletAddress ?? null,
  };
}

async function getOpenChallengeRecord(challengeId: string) {
  const challenge = await prisma.openChallenge.findUnique({
    where: { id: challengeId },
    include: {
      creator: { select: { walletAddress: true } },
      acceptedBy: { select: { walletAddress: true } },
    },
  });

  if (!challenge) return null;

  if (challenge.status === "OPEN" && challenge.expiresAt.getTime() <= Date.now()) {
    const expired = await prisma.openChallenge.update({
      where: { id: challenge.id },
      data: { status: "EXPIRED" },
      include: {
        creator: { select: { walletAddress: true } },
        acceptedBy: { select: { walletAddress: true } },
      },
    });
    return expired;
  }

  return challenge;
}

export async function getPublicGame(roomId: string) {
  return getPublicGameSnapshot(roomId);
}

export async function loginWithWallet(walletAddress: string) {
  if (!walletAddress) {
    throw new Error("Wallet address is required");
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { walletAddress },
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
    });

    const user = existingUser
      ? existingUser
      : await prisma.user.create({
          data: {
            walletAddress,
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
          },
        });

    return { success: true, user };
  } catch (error) {
    console.error("Error logging in with wallet:", error);
    return { success: false, error: "Failed to login with wallet" };
  }
}

async function updateUserEmailRecord(
  walletAddress: string,
  email: string,
  options?: { markPromptSeen?: boolean },
) {
  const normalizedEmail = normalizeEmailInput(email);

  if (normalizedEmail && !EMAIL_PATTERN.test(normalizedEmail)) {
    return { success: false, error: "Enter a valid email address" };
  }

  const existingUser = await prisma.user.findUnique({
    where: { walletAddress },
    select: { id: true },
  });

  if (!existingUser) {
    return { success: false, error: "User not found" };
  }

  if (normalizedEmail) {
    const conflict = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        walletAddress: { not: walletAddress },
      },
      select: { id: true },
    });

    if (conflict) {
      return { success: false, error: "Email is already linked to another wallet" };
    }
  }

  const updated = await prisma.user.update({
    where: { walletAddress },
    data: {
      email: normalizedEmail || null,
    },
    select: {
      walletAddress: true,
      email: true,
      username: true,
    },
  });

  revalidatePath("/profile");
  revalidatePath("/play");
  return { success: true, profile: updated };
}

export async function publishPost(formData: FormData) {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const postId = formData.get("postId") as string;

  if (!title?.trim()) {
    throw new Error("Title is required");
  }

  if (containsProfanity(content)) {
    throw new Error("Content contains profanity");
  }

  // NOTE: Post creation logic is disabled/broken as Post model was removed.
  // We should likely remove/refactor this, but for now just commenting it out to fix build
  // or leaving as is if it won't be called.
  // Given user asked to remove posts, this function is now deprecated.
  throw new Error("Post functionality is deprecated");

  /*
  const post = await prisma.post.upsert({
    where: {
      id: parseInt(postId ?? "-1"),
      author: {
        email: session.user.email!,
      },
    },
    update: {
      title: title.trim(),
      content: content?.trim(),
      published: true,
    },
    create: {
      title: title.trim(),
      content: content?.trim(),
      published: true,
      author: {
        connect: {
          email: session.user.email!,
        },
      },
    },
  });

  revalidatePath(`/posts/${post.id}`);
  revalidatePath("/posts");
  redirect(`/posts/${post.id}`);
  */
}

export async function saveDraft(formData: FormData) {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }
  // Deprecated as Post model was removed
  throw new Error("Post functionality is deprecated");
}

export async function searchUsers(query: string) {
  if (!query || query.length < 3) return { success: true, users: [] };

  try {
    const normalizedQuery = query.trim().toLowerCase();
    const users = await prisma.user.findMany({
      where: {
        OR: [
          {
            walletAddress: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            username: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
        ],
      },
      take: 10,
      select: {
        id: true,
        walletAddress: true,
        username: true,
        rating: true,
      },
    });
    return { success: true, users };
  } catch (error) {
    console.error("Error searching users:", error);
    return { success: false, error: "Failed to search users" };
  }
}
export async function getRecentOpponents(walletAddress: string) {
  if (!walletAddress)
    return { success: false, error: "Wallet address is required" };

  try {
    const user = await (prisma.user as any).findUnique({
      where: { walletAddress },
      select: { id: true },
    });

    if (!user) return { success: true, opponents: [] };

    const games = await (prisma as any).game.findMany({
      where: {
        OR: [{ whitePlayerId: user.id }, { blackPlayerId: user.id }],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        whitePlayer: true,
        blackPlayer: true,
      },
    });

    const opponentsMap = new Map();
    games.forEach((game: any) => {
      const white = game.whitePlayer;
      const black = game.blackPlayer;
      if (white && white.walletAddress !== walletAddress) {
        opponentsMap.set(white.walletAddress, {
          ...white,
          name: white.username ?? null,
        });
      }
      if (black && black.walletAddress !== walletAddress) {
        opponentsMap.set(black.walletAddress, {
          ...black,
          name: black.username ?? null,
        });
      }
    });

    return { success: true, opponents: Array.from(opponentsMap.values()) };
  } catch (error) {
    console.error("Error fetching recent opponents:", error);
    return { success: false, error: "Failed to fetch recent opponents" };
  }
}

export async function createGame(
  whiteAddress: string,
  blackAddress: string,
  fen: string = "start",
) {
  try {
    const white = await (prisma.user as any).findUnique({
      where: { walletAddress: whiteAddress },
    });
    const black = await (prisma.user as any).findUnique({
      where: { walletAddress: blackAddress },
    });

    if (!white || !black)
      return { success: false, error: "One or both players not found" };

    const game = await (prisma as any).game.create({
      data: {
        whitePlayerId: white.id,
        blackPlayerId: black.id,
        fen: fen,
        status: "IN_PROGRESS",
      },
    });

    return { success: true, gameId: game.id };
  } catch (error) {
    console.error("Error creating game:", error);
    return { success: false, error: "Failed to create game" };
  }
}

export async function createOpenChallengeLink(
  walletAddress: string,
  timeControl?: number | string | null,
  options?: {
    staked?: boolean;
    stakeToken?: string | null;
    stakeAmount?: string | null;
  },
) {
  if (!walletAddress) {
    return { success: false, error: "Wallet address is required" };
  }

  try {
    const staked = !!options?.staked;
    const normalizedStakeAmount = staked
      ? normalizeStakeAmountString(options?.stakeAmount)
      : null;
    const normalizedStakeToken = staked ? options?.stakeToken?.trim() ?? null : null;

    if (
      staked &&
      (!normalizedStakeToken ||
        !/^0x[a-fA-F0-9]{40}$/.test(normalizedStakeToken) ||
        !normalizedStakeAmount)
    ) {
      return { success: false, error: "Valid stake token and amount are required" };
    }

    const user = await prisma.user.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress },
      select: { id: true },
    });

    await prisma.openChallenge.updateMany({
      where: {
        creatorId: user.id,
        status: "OPEN",
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });

    const challenge = await prisma.openChallenge.create({
      data: {
        creatorId: user.id,
        timeControl: staked
          ? clampStakedTimeControlMinutes(timeControl)
          : normalizeTimeControlMinutes(timeControl),
        staked,
        stakeToken: normalizedStakeToken,
        stakeAmount: normalizedStakeAmount,
        expiresAt: new Date(Date.now() + OPEN_CHALLENGE_TTL_MS),
      },
      include: {
        creator: { select: { walletAddress: true } },
        acceptedBy: { select: { walletAddress: true } },
      },
    });

    return {
      success: true,
      challenge: await serializeOpenChallenge(challenge),
    };
  } catch (error) {
    console.error("Error creating open challenge:", error);
    return { success: false, error: "Failed to create challenge link" };
  }
}

export async function getOpenChallenge(challengeId: string) {
  if (!challengeId) {
    return { success: false, error: "Challenge id is required" };
  }

  try {
    const challenge = await getOpenChallengeRecord(challengeId);

    if (!challenge) {
      return { success: false, error: "Challenge not found" };
    }

    return {
      success: true,
      challenge: await serializeOpenChallenge(challenge),
    };
  } catch (error) {
    console.error("Error fetching open challenge:", error);
    return { success: false, error: "Failed to fetch challenge" };
  }
}

export async function cancelOpenChallenge(
  challengeId: string,
  walletAddress: string,
) {
  if (!challengeId || !walletAddress) {
    return { success: false, error: "Challenge id and wallet are required" };
  }

  try {
    const challenge = await getOpenChallengeRecord(challengeId);

    if (!challenge) {
      return { success: false, error: "Challenge not found" };
    }

    if (challenge.creator.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return { success: false, error: "Only the creator can cancel this challenge" };
    }

    if (challenge.status !== "OPEN") {
      return {
        success: false,
        error:
          challenge.status === "ACCEPTED"
            ? "Challenge already accepted"
            : "Challenge is no longer open",
      };
    }

    const cancelled = await prisma.openChallenge.update({
      where: { id: challengeId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
      include: {
        creator: { select: { walletAddress: true } },
        acceptedBy: { select: { walletAddress: true } },
      },
    });

    revalidatePath(`/play/challenge/${challengeId}`);

    return {
      success: true,
      challenge: await serializeOpenChallenge(cancelled),
    };
  } catch (error) {
    console.error("Error cancelling open challenge:", error);
    return { success: false, error: "Failed to cancel challenge" };
  }
}

export async function getUserProfile(walletAddress: string) {
  if (!walletAddress)
    return { success: false, error: "Wallet address is required" };

  try {
    const user = await prisma.user.findUnique({
      where: { walletAddress },
      select: {
        id: true,
        walletAddress: true,
        username: true,
        email: true,
        rating: true,
        bulletRating: true,
        blitzRating: true,
        rapidRating: true,
        stakedRating: true,
        createdAt: true,
      },
    });

    if (!user) return { success: false, error: "User not found" };

    const [totalGames, wins, draws] = await Promise.all([
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
    ]);

    const losses = totalGames - wins - draws;

    return {
      success: true,
      profile: {
        walletAddress: user.walletAddress,
        username: user.username,
        email: user.email,
        ratings: getAllRatings(user),
        joinedAt: user.createdAt.toISOString(),
        totalGames,
        wins,
        losses,
        draws,
        winRate: totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0,
      },
    };
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return { success: false, error: "Failed to fetch user profile" };
  }
}

export async function getGameHistory(
  walletAddress: string,
  page = 1,
  pageSize = 10,
) {
  if (!walletAddress)
    return { success: false, error: "Wallet address is required" };

  try {
    const user = await prisma.user.findUnique({
      where: { walletAddress },
      select: { id: true },
    });

    if (!user) return { success: true, games: [], totalPages: 0 };

    const where = {
      status: { in: ["COMPLETED" as const, "DRAW" as const] },
      OR: [{ whitePlayerId: user.id }, { blackPlayerId: user.id }],
    };

    const [games, totalCount] = await Promise.all([
      prisma.game.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
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
          winner: { select: { id: true, walletAddress: true } },
        },
      }),
      prisma.game.count({ where }),
    ]);

    const mapped = games.map((g) => {
      const isWhite = g.whitePlayerId === user.id;
      const opponentPlayer = isWhite ? g.blackPlayer : g.whitePlayer;
      const result = !g.winnerId
        ? ("draw" as const)
        : g.winnerId === user.id
          ? ("win" as const)
          : ("loss" as const);

      return {
        id: g.id,
        result,
        playedAs: isWhite ? ("white" as const) : ("black" as const),
        opponentAddress: opponentPlayer?.walletAddress ?? "Unknown",
        opponentUsername: opponentPlayer?.username ?? null,
        opponentRating: getPlayerRatingForTimeControl(
          opponentPlayer,
          g.timeControl,
          !!g.onChainGameId,
        ),
        timeControl: g.timeControl,
        isStaked: !!g.onChainGameId,
        onChainGameId: g.onChainGameId,
        stakeToken: g.stakeToken ?? null,
        wagerAmount: g.wagerAmount ?? null,
        date: g.updatedAt.toISOString(),
      };
    });

    return {
      success: true,
      games: mapped,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  } catch (error) {
    console.error("Error fetching game history:", error);
    return { success: false, error: "Failed to fetch game history" };
  }
}

export async function getStakedGameHistory(
  walletAddress: string,
  page = 1,
  pageSize = 20,
) {
  if (!walletAddress)
    return { success: false, error: "Wallet address is required" };

  try {
    const user = await prisma.user.findUnique({
      where: { walletAddress },
      select: { id: true },
    });

    if (!user) return { success: true, games: [], totalPages: 0 };

    const where = {
      status: { in: ["COMPLETED" as const, "DRAW" as const] },
      onChainGameId: { not: null },
      OR: [{ whitePlayerId: user.id }, { blackPlayerId: user.id }],
    };

    const [games, totalCount] = await Promise.all([
      prisma.game.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          whitePlayer: {
            select: { id: true, walletAddress: true, username: true, rating: true },
          },
          blackPlayer: {
            select: { id: true, walletAddress: true, username: true, rating: true },
          },
          winner: { select: { id: true, walletAddress: true } },
        },
      }),
      prisma.game.count({ where }),
    ]);

    const mapped = games.map((g) => {
      const isWhite = g.whitePlayerId === user.id;
      const opponentPlayer = isWhite ? g.blackPlayer : g.whitePlayer;
      const result = !g.winnerId
        ? ("draw" as const)
        : g.winnerId === user.id
          ? ("win" as const)
          : ("loss" as const);

      return {
        id: g.id,
        onChainGameId: g.onChainGameId!,
        stakeToken: g.stakeToken ?? "",
        wagerAmount: g.wagerAmount ?? 0,
        result,
        playedAs: isWhite ? ("white" as const) : ("black" as const),
        opponentAddress: opponentPlayer?.walletAddress ?? "Unknown",
        opponentUsername: opponentPlayer?.username ?? null,
        date: g.updatedAt.toISOString(),
      };
    });

    return {
      success: true,
      games: mapped,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  } catch (error) {
    console.error("Error fetching staked game history:", error);
    return { success: false, error: "Failed to fetch staked game history" };
  }
}

export async function updateUsername(walletAddress: string, username: string) {
  if (!walletAddress) {
    return { success: false, error: "Wallet address is required" };
  }

  const normalizedUsername = normalizeUsernameInput(username);
  if (!normalizedUsername) {
    return { success: false, error: "Username is required" };
  }

  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    return {
      success: false,
      error: "Username must be 3-20 characters and use only letters, numbers, or underscores",
    };
  }

  if (containsProfanity(normalizedUsername)) {
    return { success: false, error: "Username contains blocked language" };
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { walletAddress },
      select: { id: true },
    });

    if (!existingUser) {
      return { success: false, error: "User not found" };
    }

    const conflict = await prisma.user.findFirst({
      where: {
        username: normalizedUsername,
        walletAddress: { not: walletAddress },
      },
      select: { id: true },
    });

    if (conflict) {
      return { success: false, error: "Username is already taken" };
    }

    const updated = await prisma.user.update({
      where: { walletAddress },
      data: { username: normalizedUsername },
      select: {
        walletAddress: true,
        username: true,
      },
    });

    revalidatePath("/profile");
    revalidatePath("/watch");
    revalidatePath("/play");
    return { success: true, profile: updated };
  } catch (error) {
    console.error("Error updating username:", error);
    return { success: false, error: "Failed to update username" };
  }
}

export async function updateEmail(walletAddress: string, email: string) {
  if (!walletAddress) {
    return { success: false, error: "Wallet address is required" };
  }

  try {
    return await updateUserEmailRecord(walletAddress, email, {
      markPromptSeen: true,
    });
  } catch (error) {
    console.error("Error updating email:", error);
    return { success: false, error: "Failed to update email" };
  }
}
