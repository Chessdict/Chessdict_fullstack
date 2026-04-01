import "server-only";

import prisma from "@/lib/prisma";
import { getMemojiForAddress } from "@/lib/memoji";
import { getDisplayName, formatWalletAddress } from "@/lib/utils";
import { isRedisReady, redis } from "../../../lib/redis.mjs";

const USER_SOCKET_PREFIX = "usersocket:";

export type ChessdictsMember = {
  walletAddress: string;
  username: string | null;
  displayName: string;
  shortWallet: string;
  memoji: string;
  rating: number;
  joinedAt: string;
};

export type ChessdictsHubData = {
  totalMembers: number;
  totalOnline: number;
  joinedLast24Hours: number;
  topRatedPlayers: ChessdictsMember[];
  newestMembers: ChessdictsMember[];
};

function mapMember(member: {
  walletAddress: string;
  username: string | null;
  rating: number;
  createdAt: Date;
}) {
  return {
    walletAddress: member.walletAddress,
    username: member.username,
    displayName: getDisplayName(member.username, member.walletAddress, "Player"),
    shortWallet: formatWalletAddress(member.walletAddress),
    memoji: getMemojiForAddress(member.walletAddress),
    rating: member.rating,
    joinedAt: member.createdAt.toISOString(),
  };
}

async function countOnlineMembers() {
  if (!isRedisReady()) return 0;

  try {
    let cursor = "0";
    let total = 0;

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        `${USER_SOCKET_PREFIX}*`,
        "COUNT",
        200,
      );
      cursor = nextCursor;
      total += keys.length;
    } while (cursor !== "0");

    return total;
  } catch (error) {
    console.error("[CHESSDICTS] Failed to count online members:", error);
    return 0;
  }
}

export async function getChessdictsHubData(): Promise<ChessdictsHubData> {
  const joinedSince = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [totalMembers, joinedLast24Hours, topRatedPlayers, newestMembers, totalOnline] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          createdAt: { gte: joinedSince },
        },
      }),
      prisma.user.findMany({
        orderBy: [{ rating: "desc" }, { createdAt: "asc" }],
        take: 10,
        select: {
          walletAddress: true,
          username: true,
          rating: true,
          createdAt: true,
        },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          walletAddress: true,
          username: true,
          rating: true,
          createdAt: true,
        },
      }),
      countOnlineMembers(),
    ]);

  return {
    totalMembers,
    totalOnline,
    joinedLast24Hours,
    topRatedPlayers: topRatedPlayers.flatMap((member) =>
      member.walletAddress
        ? [
            mapMember({
              walletAddress: member.walletAddress,
              username: member.username ?? null,
              rating: member.rating,
              createdAt: member.createdAt,
            }),
          ]
        : [],
    ),
    newestMembers: newestMembers.flatMap((member) =>
      member.walletAddress
        ? [
            mapMember({
              walletAddress: member.walletAddress,
              username: member.username ?? null,
              rating: member.rating,
              createdAt: member.createdAt,
            }),
          ]
        : [],
    ),
  };
}
