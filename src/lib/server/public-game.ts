import "server-only";

import prisma from "@/lib/prisma";
import { getMemojiForAddress } from "@/lib/memoji";
import { getPlayerRatingForTimeControl } from "@/lib/player-ratings";
import { getDisplayName, formatWalletAddress } from "@/lib/utils";
import {
  getTimeControlSeconds,
  normalizeTimeControlMinutes,
} from "@/lib/time-control";

const PUBLIC_GAME_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INITIAL_BOARD_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const LIVE_WATCH_WINDOW_MS = 1000 * 60 * 60;

type RedisMoveRecord = {
  san?: unknown;
  from?: unknown;
  to?: unknown;
  color?: unknown;
  piece?: unknown;
  timestamp?: unknown;
};

type RedisGameState = {
  fen?: unknown;
  moves?: unknown;
};

type RedisTimerState = {
  initialTime?: unknown;
  whiteTime?: unknown;
  blackTime?: unknown;
  turn?: unknown;
  lastMoveTimestamp?: unknown;
};

export type PublicMoveRecord = {
  san: string;
  from: string;
  to: string;
  color: "w" | "b";
  piece: string;
  timestamp: number;
};

export type PublicPlayerInfo = {
  address: string;
  shortAddress: string;
  username: string | null;
  displayName: string;
  rating: number;
  memoji: string;
};

export type PublicGameSnapshot = {
  roomId: string;
  status: "IN_PROGRESS" | "COMPLETED" | "DRAW";
  result: "white" | "black" | "draw" | null;
  timeControl: number;
  initialTime: number;
  whiteTime: number;
  blackTime: number;
  turn: "w" | "b";
  fen: string;
  pgn: string | null;
  moves: PublicMoveRecord[];
  white: PublicPlayerInfo;
  black: PublicPlayerInfo;
  createdAt: string;
  endedAt: string | null;
  isStaked: boolean;
};

function getFenTurn(fen: string) {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

function sanitizeMoveRecord(move: RedisMoveRecord): PublicMoveRecord | null {
  if (
    typeof move?.san !== "string" ||
    typeof move?.from !== "string" ||
    typeof move?.to !== "string" ||
    (move?.color !== "w" && move?.color !== "b") ||
    typeof move?.piece !== "string"
  ) {
    return null;
  }

  const numericTimestamp =
    typeof move.timestamp === "number"
      ? move.timestamp
      : Number.parseInt(String(move.timestamp ?? ""), 10);

  return {
    san: move.san,
    from: move.from,
    to: move.to,
    color: move.color,
    piece: move.piece,
    timestamp: Number.isFinite(numericTimestamp)
      ? numericTimestamp
      : Date.now(),
  };
}

function buildPublicPlayerInfo(
  player: { walletAddress: string; username?: string | null },
  rating: number,
): PublicPlayerInfo {
  return {
    address: player.walletAddress,
    shortAddress: formatWalletAddress(player.walletAddress),
    username: player.username ?? null,
    displayName: getDisplayName(player.username, player.walletAddress, "Player"),
    rating,
    memoji: getMemojiForAddress(player.walletAddress),
  };
}

function getLiveTimerSnapshot(
  timerState: RedisTimerState | null,
  fallbackTimeControl: number,
  fallbackFen: string,
): {
  initialTime: number;
  whiteTime: number;
  blackTime: number;
  turn: "w" | "b";
} {
  const initialTime = getTimeControlSeconds(fallbackTimeControl);

  if (!timerState) {
    return {
      initialTime,
      whiteTime: initialTime,
      blackTime: initialTime,
      turn: getFenTurn(fallbackFen),
    };
  }

  const whiteTime =
    typeof timerState.whiteTime === "number"
      ? timerState.whiteTime
      : initialTime;
  const blackTime =
    typeof timerState.blackTime === "number"
      ? timerState.blackTime
      : initialTime;
  const timerInitialTime =
    typeof timerState.initialTime === "number"
      ? timerState.initialTime
      : initialTime;
  const lastMoveTimestamp =
    typeof timerState.lastMoveTimestamp === "number"
      ? timerState.lastMoveTimestamp
      : Date.now();
  const turn = timerState.turn === "b" ? "b" : "w";
  const elapsedSeconds = Math.max(0, (Date.now() - lastMoveTimestamp) / 1000);

  return {
    initialTime: Math.round(timerInitialTime),
    whiteTime: Math.round(
      turn === "w" ? Math.max(0, whiteTime - elapsedSeconds) : whiteTime,
    ),
    blackTime: Math.round(
      turn === "b" ? Math.max(0, blackTime - elapsedSeconds) : blackTime,
    ),
    turn,
  };
}

export async function getPublicGameSnapshot(
  roomId: string,
): Promise<PublicGameSnapshot | null> {
  if (!PUBLIC_GAME_ID_PATTERN.test(String(roomId ?? ""))) {
    return null;
  }

  const game = await prisma.game.findUnique({
    where: { id: roomId },
    include: {
      whitePlayer: true,
      blackPlayer: true,
    },
  });

  if (!game || !game.whitePlayer || !game.blackPlayer) {
    return null;
  }

  const { getGameState, getGameTimer } = await import("../../../lib/redis.mjs");
  const redisGameState = (await getGameState(roomId)) as RedisGameState | null;
  const redisTimerState = (await getGameTimer(roomId)) as RedisTimerState | null;
  const hasLiveMoves =
    Array.isArray(redisGameState?.moves) && redisGameState.moves.length > 0;

  if (
    game.status !== "IN_PROGRESS" &&
    game.status !== "COMPLETED" &&
    game.status !== "DRAW"
  ) {
    return null;
  }

  if (
    game.status !== "IN_PROGRESS" &&
    !hasLiveMoves &&
    typeof game.pgn !== "string"
  ) {
    // Finished-game replay needs persisted PGN or moves after live Redis cleanup.
    return null;
  }

  const timeControl = normalizeTimeControlMinutes(game.timeControl);
  const isStaked =
    !!game.onChainGameId || !!game.stakeToken || game.wagerAmount != null;
  const white = buildPublicPlayerInfo(
    game.whitePlayer,
    getPlayerRatingForTimeControl(game.whitePlayer, timeControl, isStaked),
  );
  const black = buildPublicPlayerInfo(
    game.blackPlayer,
    getPlayerRatingForTimeControl(game.blackPlayer, timeControl, isStaked),
  );
  const fen =
    typeof redisGameState?.fen === "string"
      ? redisGameState.fen
      : game.fen === "start"
        ? INITIAL_BOARD_FEN
        : game.fen || INITIAL_BOARD_FEN;
  const moves = Array.isArray(redisGameState?.moves)
    ? redisGameState.moves
        .map((move) => sanitizeMoveRecord(move as RedisMoveRecord))
        .filter((move): move is PublicMoveRecord => !!move)
    : [];
  const timerSnapshot = getLiveTimerSnapshot(redisTimerState, timeControl, fen);

  let result: PublicGameSnapshot["result"] = null;
  if (game.status === "DRAW") {
    result = "draw";
  } else if (game.winnerId && game.winnerId === game.whitePlayerId) {
    result = "white";
  } else if (game.winnerId && game.winnerId === game.blackPlayerId) {
    result = "black";
  }

  return {
    roomId: game.id,
    status: game.status as PublicGameSnapshot["status"],
    result,
    timeControl,
    initialTime: timerSnapshot.initialTime,
    whiteTime: timerSnapshot.whiteTime,
    blackTime: timerSnapshot.blackTime,
    turn: timerSnapshot.turn,
    fen,
    pgn: game.pgn ?? null,
    moves,
    white,
    black,
    createdAt: game.createdAt.toISOString(),
    endedAt: game.status === "IN_PROGRESS" ? null : game.updatedAt.toISOString(),
    isStaked,
  };
}

export async function getPublicLiveGames(
  limit?: number | null,
): Promise<PublicGameSnapshot[]> {
  const liveGames = await prisma.game.findMany({
    where: {
      status: "IN_PROGRESS",
      // Keep the live wall limited to games that are actively updating now.
      // Finished games stay in Postgres for history/rating integrity.
      updatedAt: { gte: new Date(Date.now() - LIVE_WATCH_WINDOW_MS) },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  const snapshots = await Promise.all(
    liveGames.map((game) => getPublicGameSnapshot(game.id)),
  );

  const activeSnapshots = snapshots.filter(
    (snapshot): snapshot is PublicGameSnapshot =>
      !!snapshot && snapshot.status === "IN_PROGRESS",
  );

  return typeof limit === "number" && limit > 0
    ? activeSnapshots.slice(0, limit)
    : activeSnapshots;
}
