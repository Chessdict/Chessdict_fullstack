"use server";

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { containsProfanity } from "@/lib/utils";
import { getAllRatings, getPlayerRatingForTimeControl } from "@/lib/player-ratings";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function loginWithWallet(walletAddress: string) {
  if (!walletAddress) {
    throw new Error("Wallet address is required");
  }

  try {
    const user = await prisma.user.upsert({
      where: {
        walletAddress: walletAddress,
      },
      update: {},
      create: {
        walletAddress: walletAddress,
      },
    });
    return { success: true, user };
  } catch (error) {
    console.error("Error logging in with wallet:", error);
    return { success: false, error: "Failed to login with wallet" };
  }
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
    const users = await prisma.user.findMany({
      where: {
        walletAddress: {
          contains: query,
          mode: "insensitive",
        },
      },
      take: 10,
      select: {
        id: true,
        walletAddress: true,
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
        opponentsMap.set(white.walletAddress, white);
      }
      if (black && black.walletAddress !== walletAddress) {
        opponentsMap.set(black.walletAddress, black);
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

export async function getUserProfile(walletAddress: string) {
  if (!walletAddress)
    return { success: false, error: "Wallet address is required" };

  try {
    const user = await prisma.user.findUnique({
      where: { walletAddress },
      select: {
        id: true,
        walletAddress: true,
        rating: true,
        bulletRating: true,
        blitzRating: true,
        rapidRating: true,
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
              rating: true,
              bulletRating: true,
              blitzRating: true,
              rapidRating: true,
            },
          },
          blackPlayer: {
            select: {
              id: true,
              walletAddress: true,
              rating: true,
              bulletRating: true,
              blitzRating: true,
              rapidRating: true,
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
        opponentRating: getPlayerRatingForTimeControl(opponentPlayer, g.timeControl),
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
            select: { id: true, walletAddress: true, rating: true },
          },
          blackPlayer: {
            select: { id: true, walletAddress: true, rating: true },
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
