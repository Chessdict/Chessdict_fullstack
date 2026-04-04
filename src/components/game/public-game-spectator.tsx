"use client";

import { Chess } from "chess.js";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard, defaultPieces } from "react-chessboard";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useAccount } from "wagmi";
import { useBoardTheme } from "@/hooks/useBoardTheme";
import { useBoardPieces } from "@/hooks/useBoardPieces";
import { useChessSounds } from "@/hooks/useChessSounds";
import { useSocket } from "@/hooks/useSocket";
import { getMemojiForAddress } from "@/lib/memoji";
import { getTimeControlDisplay } from "@/lib/time-control";
import { formatWalletAddress, getDisplayName } from "@/lib/utils";
import type {
  PublicGameSnapshot,
  PublicMoveRecord,
} from "@/lib/server/public-game";
import { PlayerRatingBadge } from "@/components/chess/player-rating-badge";
import { customPieces } from "@/components/chess/custom-pieces";

type PublicGameSpectatorProps = {
  initialGame: PublicGameSnapshot;
  mode?: "full" | "wall";
};

type SpectatorSocketSnapshot = Omit<PublicGameSnapshot, "white" | "black"> & {
  white: {
    address: string;
    shortAddress?: string;
    username?: string | null;
    displayName?: string;
    rating: number;
    memoji?: string;
  };
  black: {
    address: string;
    shortAddress?: string;
    username?: string | null;
    displayName?: string;
    rating: number;
    memoji?: string;
  };
};

type SpectatorState = PublicGameSnapshot & {
  syncedAtMs: number;
};

const MOVE_ANIMATION_DURATION_MS = 150;
const INITIAL_BOARD_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function formatClock(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds - 1e-9));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getFenTurn(fen: string) {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

function getPromotionPiece(move: PublicMoveRecord) {
  const match = move.san.match(/=([QRBN])/i);
  return match ? match[1].toLowerCase() : undefined;
}

function buildFenAtMove(moves: PublicMoveRecord[], moveIndex: number) {
  if (moveIndex < 0) {
    return INITIAL_BOARD_FEN;
  }

  const chess = new Chess();
  for (let index = 0; index <= moveIndex; index += 1) {
    const move = moves[index];
    if (!move) break;

    const promotion = getPromotionPiece(move);
    let appliedMove = null;

    try {
      appliedMove = chess.move({
        from: move.from,
        to: move.to,
        ...(promotion ? { promotion } : {}),
      });
    } catch (_error) {
      appliedMove = null;
    }

    if (!appliedMove) {
      try {
        appliedMove = chess.move(move.san);
      } catch (_error) {
        return index === moves.length - 1 ? null : chess.fen();
      }
    }
  }

  return chess.fen();
}

function normalizeSnapshot(
  snapshot: SpectatorSocketSnapshot | PublicGameSnapshot,
): SpectatorState {
  return {
    ...snapshot,
    white: {
      ...snapshot.white,
      username: snapshot.white.username ?? null,
      shortAddress:
        snapshot.white.shortAddress ?? formatWalletAddress(snapshot.white.address),
      displayName:
        snapshot.white.displayName ??
        getDisplayName(snapshot.white.username, snapshot.white.address, "White"),
      memoji: snapshot.white.memoji ?? getMemojiForAddress(snapshot.white.address),
    },
    black: {
      ...snapshot.black,
      username: snapshot.black.username ?? null,
      shortAddress:
        snapshot.black.shortAddress ?? formatWalletAddress(snapshot.black.address),
      displayName:
        snapshot.black.displayName ??
        getDisplayName(snapshot.black.username, snapshot.black.address, "Black"),
      memoji: snapshot.black.memoji ?? getMemojiForAddress(snapshot.black.address),
    },
    syncedAtMs: Date.now(),
  };
}

function resultLabel(snapshot: SpectatorState) {
  if (snapshot.result === "white") return "White won";
  if (snapshot.result === "black") return "Black won";
  if (snapshot.result === "draw") return "Draw";
  return snapshot.status === "IN_PROGRESS" ? "Live" : "Awaiting result";
}

function formatStakeAmount(amount: number | null) {
  if (amount == null || !Number.isFinite(amount)) return null;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function formatStakeLabel(amount: number | null) {
  const formatted = formatStakeAmount(amount);
  return formatted ? `🤑💸 ${formatted}` : "🤑💸 Staked";
}

function formatDuration(startedAt: string | null, endedAt: string | null) {
  if (!startedAt || !endedAt) return null;
  const startedMs = new Date(startedAt).getTime();
  const endedMs = new Date(endedAt).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs <= startedMs) {
    return null;
  }

  const totalSeconds = Math.round((endedMs - startedMs) / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatResultReason(reason: string | null) {
  if (!reason) return null;
  return reason
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildReviewSoundMove(move: PublicMoveRecord) {
  const san = move.san ?? "";
  let flags = "";

  if (san.includes("=")) flags += "p";
  if (san === "O-O" || san === "O-O+") flags += "k";
  if (san === "O-O-O" || san === "O-O-O+") flags += "q";

  return {
    san,
    captured: san.includes("x") ? "x" : undefined,
    flags,
  };
}

function PlayerHeader({
  label,
  player,
  time,
  isTurn,
}: {
  label: string;
  player: SpectatorState["white"];
  time: number;
  isTurn: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-10 w-10 overflow-hidden rounded-full border border-white/10 bg-white/5">
          <Image
            src={player.memoji}
            alt={player.shortAddress}
            width={40}
            height={40}
            className="h-full w-full object-contain"
          />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={`/player/${player.address}`}
              className="truncate text-sm font-semibold text-white transition hover:text-emerald-300"
            >
              {player.displayName}
            </Link>
            <PlayerRatingBadge rating={player.rating} />
          </div>
          <p className="truncate text-[11px] text-white/45">
            {label} · {player.shortAddress}
            {isTurn ? " · thinking" : ""}
          </p>
        </div>
      </div>
      <div className="rounded-xl bg-black/50 px-2.5 py-1.5 text-sm font-semibold tabular-nums text-white">
        {formatClock(time)}
      </div>
    </div>
  );
}

export function PublicGameSpectator({
  initialGame,
  mode = "full",
}: PublicGameSpectatorProps) {
  const { boardTheme } = useBoardTheme();
  const [game, setGame] = useState<SpectatorState>(() =>
    normalizeSnapshot(initialGame),
  );
  const [now, setNow] = useState(() => Date.now());
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [isWallDismissed, setIsWallDismissed] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const { address } = useAccount();
  const { useCustomPiecesOnMobile } = useBoardPieces();
  const { playMoveSound } = useChessSounds();
  const { socket, isConnected } = useSocket(address ?? undefined);
  const boardPieces = isMobileViewport && !useCustomPiecesOnMobile ? defaultPieces : customPieces;
  const boardAnimationsEnabled = true;
  const [reviewMoveIndex, setReviewMoveIndex] = useState<number>(() =>
    initialGame.status === "IN_PROGRESS" || initialGame.moves.length === 0
      ? -1
      : initialGame.moves.length - 1,
  );
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const lastPlayedReviewMoveRef = useRef<number | null>(null);

  useEffect(() => {
    setGame(normalizeSnapshot(initialGame));
    setIsUnavailable(false);
    setIsWallDismissed(false);
    setReviewMoveIndex(
      initialGame.status === "IN_PROGRESS" || initialGame.moves.length === 0
        ? -1
        : initialGame.moves.length - 1,
    );
    setIsAutoPlaying(false);
    lastPlayedReviewMoveRef.current = null;
  }, [initialGame]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateViewport = () => {
      setIsMobileViewport(window.innerWidth < 640);
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (initialGame.status !== "IN_PROGRESS") {
      return;
    }

    if (!socket) return;

    const joinSpectatorRoom = () => {
      socket.emit("joinSpectatorRoom", { roomId: initialGame.roomId });
    };

    const handleSnapshot = (snapshot: SpectatorSocketSnapshot) => {
      if (snapshot.roomId !== initialGame.roomId) return;
      setGame(normalizeSnapshot(snapshot));
      setIsUnavailable(false);
    };

    const handleMove = (payload: {
      roomId: string;
      fen: string;
      moves: PublicMoveRecord[];
      turn?: "w" | "b";
    }) => {
      if (payload.roomId !== initialGame.roomId) return;
      setGame((current) => ({
        ...current,
        fen: payload.fen,
        moves: payload.moves,
        turn: payload.turn ?? getFenTurn(payload.fen),
      }));
    };

    const handleTimeSync = (payload: {
      roomId: string;
      whiteTime: number;
      blackTime: number;
      initialTime?: number;
      turn?: "w" | "b";
    }) => {
      if (payload.roomId !== initialGame.roomId) return;
      setGame((current) => ({
        ...current,
        initialTime: payload.initialTime ?? current.initialTime,
        whiteTime: payload.whiteTime,
        blackTime: payload.blackTime,
        turn: payload.turn ?? current.turn,
        syncedAtMs: Date.now(),
      }));
    };

    const handleGameOver = (payload: {
      roomId: string;
      winner: "white" | "black" | "draw";
      reason: string;
      endedAt: string;
    }) => {
      if (payload.roomId !== initialGame.roomId) return;
      setGame((current) => ({
        ...current,
        status: payload.winner === "draw" ? "DRAW" : "COMPLETED",
        result: payload.winner,
        endedAt: payload.endedAt,
      }));
    };

    const handleUnavailable = (payload: { roomId?: string }) => {
      if (payload.roomId && payload.roomId !== initialGame.roomId) return;
      setIsUnavailable(true);
    };

    socket.on("spectatorSnapshot", handleSnapshot);
    socket.on("spectatorMove", handleMove);
    socket.on("spectatorTimeSync", handleTimeSync);
    socket.on("spectatorGameOver", handleGameOver);
    socket.on("spectatorUnavailable", handleUnavailable);
    socket.on("connect", joinSpectatorRoom);

    if (socket.connected) {
      joinSpectatorRoom();
    }

    return () => {
      socket.emit("leaveSpectatorRoom", { roomId: initialGame.roomId });
      socket.off("spectatorSnapshot", handleSnapshot);
      socket.off("spectatorMove", handleMove);
      socket.off("spectatorTimeSync", handleTimeSync);
      socket.off("spectatorGameOver", handleGameOver);
      socket.off("spectatorUnavailable", handleUnavailable);
      socket.off("connect", joinSpectatorRoom);
    };
  }, [initialGame.roomId, initialGame.status, socket]);

  const displayedTimes = useMemo(() => {
    let whiteTime = game.whiteTime;
    let blackTime = game.blackTime;

    if (game.status === "IN_PROGRESS" && game.moves.length > 0) {
      const elapsedSeconds = Math.max(
        0,
        Math.floor((now - game.syncedAtMs) / 1000),
      );
      if (game.turn === "w") {
        whiteTime = Math.max(0, whiteTime - elapsedSeconds);
      } else {
        blackTime = Math.max(0, blackTime - elapsedSeconds);
      }
    }

    return { whiteTime, blackTime };
  }, [game.blackTime, game.moves.length, game.status, game.syncedAtMs, game.turn, game.whiteTime, now]);

  const effectiveReviewMoveIndex =
    game.status === "IN_PROGRESS"
      ? game.moves.length - 1
      : Math.min(Math.max(reviewMoveIndex, -1), game.moves.length - 1);

  const displayedFen = useMemo(() => {
    if (game.status === "IN_PROGRESS") {
      return game.fen;
    }

    if (game.moves.length === 0) {
      return game.fen;
    }

    const reviewFen = buildFenAtMove(game.moves, effectiveReviewMoveIndex);
    return reviewFen ?? game.fen;
  }, [effectiveReviewMoveIndex, game.fen, game.moves, game.status]);

  const displayedTurn = useMemo(() => {
    if (game.status === "IN_PROGRESS") {
      return game.turn;
    }
    return getFenTurn(displayedFen);
  }, [displayedFen, game.status, game.turn]);

  const highlightedMove =
    effectiveReviewMoveIndex >= 0 ? game.moves[effectiveReviewMoveIndex] : null;

  const lastMoveStyles = useMemo(() => {
    if (!highlightedMove) return {};

    return {
      [highlightedMove.from]: { backgroundColor: "rgba(251, 191, 36, 0.25)" },
      [highlightedMove.to]: { backgroundColor: "rgba(251, 191, 36, 0.4)" },
    };
  }, [highlightedMove]);

  const isWallMode = mode === "wall";
  const formattedStakeAmount = formatStakeAmount(game.stakeAmount);
  const stakeLabel = formatStakeLabel(game.stakeAmount);
  const isLiveGame = game.status === "IN_PROGRESS";
  const durationLabel = formatDuration(game.startedAt, game.endedAt);
  const resultReasonLabel = formatResultReason(game.resultReason);

  useEffect(() => {
    if (isLiveGame || !isAutoPlaying || game.moves.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setReviewMoveIndex((current) => {
        if (current >= game.moves.length - 1) {
          window.clearInterval(interval);
          setIsAutoPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 700);

    return () => window.clearInterval(interval);
  }, [game.moves.length, isAutoPlaying, isLiveGame]);

  useEffect(() => {
    if (isLiveGame || game.moves.length === 0) {
      lastPlayedReviewMoveRef.current = null;
      return;
    }

    if (lastPlayedReviewMoveRef.current == null) {
      lastPlayedReviewMoveRef.current = effectiveReviewMoveIndex;
      return;
    }

    if (
      effectiveReviewMoveIndex < 0 ||
      effectiveReviewMoveIndex === lastPlayedReviewMoveRef.current
    ) {
      lastPlayedReviewMoveRef.current = effectiveReviewMoveIndex;
      return;
    }

    const move = game.moves[effectiveReviewMoveIndex];
    if (move) {
      playMoveSound(buildReviewSoundMove(move), "self");
    }
    lastPlayedReviewMoveRef.current = effectiveReviewMoveIndex;
  }, [effectiveReviewMoveIndex, game.moves, isLiveGame, playMoveSound]);

  useEffect(() => {
    if (!isWallMode) return;
    if (game.status === "IN_PROGRESS") {
      setIsWallDismissed(false);
      return;
    }

    // Spectator wall cards should linger briefly for the result, then clear themselves.
    const timeout = window.setTimeout(() => {
      setIsWallDismissed(true);
    }, 10000);

    return () => window.clearTimeout(timeout);
  }, [game.status, isWallMode]);

  if (isUnavailable) {
    return (
      <div className={`${isWallMode ? "w-full" : "mx-auto max-w-5xl"} flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-10 text-center`}>
        <p className="text-lg font-semibold text-white">Game unavailable</p>
        <p className="max-w-md text-sm text-white/55">
          This game is no longer available for live public spectating.
        </p>
        {isWallMode ? null : (
          <Link
            href="/play"
            className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/12"
          >
            Go To Play
          </Link>
        )}
      </div>
    );
  }

  if (isWallMode && isWallDismissed) {
    return null;
  }

  if (isWallMode) {
    return (
      <div className="flex h-full flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300/70">
              Live Game
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {resultLabel(game)}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-white/45">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isConnected ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            {isConnected ? "Live" : "Reconnecting"}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-white/45">Black</p>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <Link
                href={`/player/${game.black.address}`}
                className="truncate text-sm font-semibold text-white transition hover:text-emerald-300"
              >
                {game.black.displayName}
              </Link>
              <PlayerRatingBadge rating={game.black.rating} />
            </div>
            <p className="mt-1 truncate text-[11px] text-white/35">
              {game.black.shortAddress}
            </p>
          </div>
          <div className="rounded-xl bg-black/50 px-2 py-1 text-sm font-semibold tabular-nums text-white">
            {formatClock(displayedTimes.blackTime)}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#1A1A1A]/80 p-2">
          <Chessboard
            options={{
              id: `spectator-wall-board-${game.roomId}`,
              position: game.fen,
              boardOrientation: "white",
              showAnimations: boardAnimationsEnabled,
              animationDurationInMs: boardAnimationsEnabled ? MOVE_ANIMATION_DURATION_MS : 0,
              allowDragging: false,
              boardStyle: { borderRadius: "14px" },
              darkSquareStyle: boardTheme.darkSquareStyle,
              lightSquareStyle: boardTheme.lightSquareStyle,
              squareStyles: lastMoveStyles,
              pieces: boardPieces,
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-white/45">White</p>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <Link
                href={`/player/${game.white.address}`}
                className="truncate text-sm font-semibold text-white transition hover:text-emerald-300"
              >
                {game.white.displayName}
              </Link>
              <PlayerRatingBadge rating={game.white.rating} />
            </div>
            <p className="mt-1 truncate text-[11px] text-white/35">
              {game.white.shortAddress}
            </p>
          </div>
          <div className="rounded-xl bg-black/50 px-2 py-1 text-sm font-semibold tabular-nums text-white">
            {formatClock(displayedTimes.whiteTime)}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-white/55">
          <span>
            {getTimeControlDisplay(game.timeControl)}
            {game.isStaked ? ` · ${stakeLabel}` : ""}
          </span>
          <span>{game.moves.length} ply</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-xs text-white/40">{game.roomId}</p>
          <Link
            href={`/watch/${game.roomId}`}
            className="shrink-0 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/12"
          >
            Open full view
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300/70">
            {isLiveGame ? "Live Spectator" : "Game Review"}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-white sm:text-2xl">
            {resultLabel(game)}
          </h1>
          <p className="mt-1 text-sm text-white/55">
            {getTimeControlDisplay(game.timeControl)}
            {game.isStaked
              ? ` · staked game · ${stakeLabel}`
              : " · casual game"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/45">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              isLiveGame && isConnected ? "bg-emerald-400" : "bg-white/25"
            }`}
          />
          {isLiveGame
            ? (isConnected ? "Live updates connected" : "Reconnecting to live updates")
            : "Replay ready"}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <PlayerHeader
            label="Black"
            player={game.black}
            time={displayedTimes.blackTime}
            isTurn={displayedTurn === "b" && game.status === "IN_PROGRESS"}
          />

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#1A1A1A]/80 p-2 sm:p-3">
            <Chessboard
              options={{
                id: `spectator-board-${game.roomId}`,
                position: displayedFen,
                boardOrientation: "white",
                showAnimations: boardAnimationsEnabled,
                animationDurationInMs: boardAnimationsEnabled ? MOVE_ANIMATION_DURATION_MS : 0,
                allowDragging: false,
                boardStyle: { borderRadius: "16px" },
                darkSquareStyle: boardTheme.darkSquareStyle,
                lightSquareStyle: boardTheme.lightSquareStyle,
                squareStyles: lastMoveStyles,
                pieces: boardPieces,
              }}
            />
          </div>

          <PlayerHeader
            label="White"
            player={game.white}
            time={displayedTimes.whiteTime}
            isTurn={displayedTurn === "w" && game.status === "IN_PROGRESS"}
          />

          {!isLiveGame ? (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
                  Review Controls
                </p>
                <p className="text-xs text-white/45">
                  {game.moves.length === 0
                    ? "Replay unavailable"
                    : effectiveReviewMoveIndex < 0
                      ? "Start position"
                      : `Move ${effectiveReviewMoveIndex + 1} of ${game.moves.length}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAutoPlaying(false);
                    setReviewMoveIndex(-1);
                  }}
                  disabled={game.moves.length === 0 || effectiveReviewMoveIndex <= -1}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Start
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAutoPlaying(false);
                    setReviewMoveIndex((current) => Math.max(-1, current - 1));
                  }}
                  disabled={game.moves.length === 0 || effectiveReviewMoveIndex <= -1}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (game.moves.length === 0) return;
                    if (effectiveReviewMoveIndex >= game.moves.length - 1) {
                      setReviewMoveIndex(-1);
                    }
                    setIsAutoPlaying((current) => !current);
                  }}
                  disabled={game.moves.length === 0}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {isAutoPlaying ? (
                    <>
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      Play
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAutoPlaying(false);
                    setReviewMoveIndex((current) =>
                      Math.min(game.moves.length - 1, current + 1),
                    );
                  }}
                  disabled={game.moves.length === 0 || effectiveReviewMoveIndex >= game.moves.length - 1}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAutoPlaying(false);
                    setReviewMoveIndex(game.moves.length - 1);
                  }}
                  disabled={game.moves.length === 0 || effectiveReviewMoveIndex >= game.moves.length - 1}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  End
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/45">
              Match Info
            </p>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-white/45">Room</dt>
                <dd className="font-mono text-xs text-white/75">{game.roomId}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-white/45">Status</dt>
                <dd className="text-white">{game.status.replace("_", " ")}</dd>
              </div>
              {resultReasonLabel ? (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-white/45">Reason</dt>
                  <dd className="text-white">{resultReasonLabel}</dd>
                </div>
              ) : null}
              {game.isStaked ? (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-white/45">Stake</dt>
                  <dd className="text-white">{stakeLabel}</dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-4">
                <dt className="text-white/45">Created</dt>
                <dd className="text-white">
                  {new Date(game.createdAt).toLocaleString()}
                </dd>
              </div>
              {game.startedAt ? (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-white/45">Started</dt>
                  <dd className="text-white">
                    {new Date(game.startedAt).toLocaleString()}
                  </dd>
                </div>
              ) : null}
              {game.endedAt ? (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-white/45">Ended</dt>
                  <dd className="text-white">
                    {new Date(game.endedAt).toLocaleString()}
                  </dd>
                </div>
              ) : null}
              {durationLabel ? (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-white/45">Duration</dt>
                  <dd className="text-white">{durationLabel}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/45">
                Moves
              </p>
              <p className="text-xs text-white/35">{game.moves.length} ply</p>
            </div>
            {game.moves.length === 0 ? (
              <p className="mt-4 text-sm text-white/45">
                {game.status === "IN_PROGRESS"
                  ? "Waiting for the first move."
                  : "This older game ended before replay moves were saved."}
              </p>
            ) : (
              <div className="mt-4 max-h-[420px] overflow-y-auto pr-1 [scrollbar-width:thin]">
                <div className="grid gap-2 text-sm">
                  {Array.from({ length: Math.ceil(game.moves.length / 2) }).map(
                    (_, index) => {
                      const whiteMove = game.moves[index * 2];
                      const blackMove = game.moves[index * 2 + 1];

                      return (
                        <button
                          type="button"
                          key={`move-pair-${index}`}
                          onClick={() =>
                            setReviewMoveIndex(
                              blackMove ? index * 2 + 1 : index * 2,
                            )
                          }
                          className="grid w-full grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded-2xl border border-white/5 bg-black/25 px-3 py-2 text-left transition hover:border-white/15 hover:bg-white/[0.06]"
                        >
                          <span className="text-xs font-semibold text-white/40">
                            {index + 1}.
                          </span>
                          <span
                            className={`truncate rounded-md px-2 py-1 ${
                              effectiveReviewMoveIndex === index * 2
                                ? "bg-emerald-400/20 text-emerald-200"
                                : "text-white"
                            }`}
                          >
                            {whiteMove?.san ?? "—"}
                          </span>
                          <span
                            className={`truncate rounded-md px-2 py-1 ${
                              effectiveReviewMoveIndex === index * 2 + 1
                                ? "bg-emerald-400/20 text-emerald-200"
                                : "text-white/70"
                            }`}
                          >
                            {blackMove?.san ?? "—"}
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
