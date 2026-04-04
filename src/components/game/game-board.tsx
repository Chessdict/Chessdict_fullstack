"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Chess, Move } from "chess.js";
import { Chessboard, defaultPieces } from "react-chessboard";
import { useGameStore } from "@/stores/game-store";
import { getBestMove } from "@/lib/chess-ai";
import { useSocket } from "@/hooks/useSocket";
import { useAccount } from "wagmi";
import { useChessdict } from "@/hooks/useChessdict";
import { ResignConfirmModal } from "./resign-confirm-modal";
import { DrawOfferModal } from "./draw-offer-modal";
import { GlassBg } from "../glass-bg";
import { useChessSounds } from "@/hooks/useChessSounds";
import { MaterialBalanceStrip } from "@/components/chess/material-balance-strip";
import { PlayerRatingBadge } from "@/components/chess/player-rating-badge";
import {
  formatGameReason,
  getAutomaticDrawReason,
} from "@/lib/game-result-display";
import { PromotionChooser } from "@/components/chess/promotion-chooser";
import { PremoveGhostOverlay } from "@/components/chess/premove-ghost-overlay";
import { customPieces } from "@/components/chess/custom-pieces";
import {
  getPromotionSelection,
  type PromotionPiece,
  type PromotionSelection,
} from "@/lib/chess-promotion";
import { canSetPremove, getPremoveTargets, type Premove } from "@/lib/premove";
import { getMaterialBalance, getSideMaterialDisplay } from "@/lib/material-balance";
import { getRatingFieldForTimeControl } from "@/lib/player-ratings";
import { useBoardTheme } from "@/hooks/useBoardTheme";
import { useBoardPieces } from "@/hooks/useBoardPieces";
import { SignalStrength } from "./signal-strength";
import { X } from "lucide-react";
import Image from "next/image";
import { cn, formatWalletAddress, getDisplayName } from "@/lib/utils";


const LOW_TIME_SOUND_THRESHOLD_SECONDS = 10;

// Helper to format time as MM:SS, with tenths under 10 seconds.
function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const mins = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60);

  if (safeSeconds > 0 && safeSeconds <= 10) {
    const tenths = Math.min(
      9,
      Math.floor((safeSeconds - Math.floor(safeSeconds)) * 10 + 1e-6),
    );
    return `${mins}:${secs.toString().padStart(2, "0")}.${tenths}`;
  }

  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Check if time is critically low (30s for 1-min games, 60s for others)
function isLowTime(seconds: number, initialTime: number): boolean {
  const threshold = initialTime <= 60 ? 30 : 60;
  return seconds <= threshold && seconds > 0;
}

function normalizeClockTurn(turn: string | null | undefined): "w" | "b" {
  return turn === "b" ? "b" : "w";
}

// Map piece codes to unicode symbols
const pieceSymbols: Record<string, { w: string; b: string }> = {
  p: { w: "\u2659", b: "\u265F" },
  n: { w: "\u2658", b: "\u265E" },
  b: { w: "\u2657", b: "\u265D" },
  r: { w: "\u2656", b: "\u265C" },
  q: { w: "\u2655", b: "\u265B" },
  k: { w: "\u2654", b: "\u265A" },
};

type SelectionMode = "move" | "premove" | null;
const MOVE_ANIMATION_DURATION_MS = 200;
const INITIAL_BOARD_FEN = new Chess().fen();

function isPromotionDestination(square: string, color: "w" | "b") {
  const rank = square[1];
  return (color === "w" && rank === "8") || (color === "b" && rank === "1");
}

function WinnerCupIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="winner-cup-gold" x1="16" y1="8" x2="48" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFF7BF" />
          <stop offset="0.28" stopColor="#F7D766" />
          <stop offset="0.6" stopColor="#D8A128" />
          <stop offset="1" stopColor="#8E5A08" />
        </linearGradient>
        <linearGradient id="winner-cup-base" x1="24" y1="42" x2="40" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F5D76B" />
          <stop offset="1" stopColor="#9A640C" />
        </linearGradient>
      </defs>

      <path
        d="M21 10h22v7c0 10.3-4.8 18.3-11 22.4C25.8 35.3 21 27.3 21 17v-7Z"
        fill="url(#winner-cup-gold)"
        stroke="#7A4A00"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M18 14h-4c-1.7 0-3 1.3-3 3 0 6.8 4.9 12.4 11.3 13.4"
        stroke="#B17812"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M46 14h4c1.7 0 3 1.3 3 3 0 6.8-4.9 12.4-11.3 13.4"
        stroke="#B17812"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M27 41h10v6c0 2.8-2.2 5-5 5s-5-2.2-5-5v-6Z"
        fill="url(#winner-cup-base)"
        stroke="#7A4A00"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M23 54h18"
        stroke="#7A4A00"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M20 58h24"
        stroke="#5C3600"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M26.5 18.5h11"
        stroke="#FFF5B1"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.9"
      />
      <ellipse cx="26" cy="23" rx="3.2" ry="7.2" fill="#FFF3AE" opacity="0.35" />
      <path
        d="m32 19.4 1.8 3.7 4.1.6-3 2.9.7 4.1-3.6-1.9-3.6 1.9.7-4.1-3-2.9 4.1-.6 1.8-3.7Z"
        fill="#FFF7D1"
        stroke="#B17812"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GameBoard() {
  const {
    gameMode,
    status,
    difficulty,
    roomId,
    playerColor,
    player,
    opponent,
    matchPlayerRatingBaseline,
    setStatus,
    addMove,
    clearMoves,
    setOpponentConnected,
    // Timer state
    initialTime,
    setInitialTime,
    setClockConfig,
    whiteTime,
    blackTime,
    setWhiteTime,
    setBlackTime,
    decrementWhiteTime,
    decrementBlackTime,
    resetTimers,
    gameOver,
    setGameOver,
    clearGameOver,
    gameResultModalDismissed,
    setGameResultModalDismissed,
    drawOfferReceived,
    drawOfferSent,
    setDrawOfferReceived,
    setDrawOfferSent,
    // Rejoin state
    rejoinFen,
    rejoinMoves,
    setRejoinData,
    clearRejoinData,
    // Opponent disconnect
    opponentDisconnectDeadline,
    selfDisconnectDeadline,
    autoAbortDeadline,
    setOpponentDisconnectDeadline,
    setSelfDisconnectDeadline,
    setAutoAbortDeadline,
    setPlayer,
    // On-chain state
    onChainGameId,
    stakeToken,
    stakeAmountRaw,
    reset: resetStore,
    // Move navigation
    viewMoveIndex,
    moves: storeMoves,
  } = useGameStore();

  const [ping, setPing] = useState<number>(0);
  const [opponentPing, setOpponentPing] = useState<number>(0);
  const [showResignModal, setShowResignModal] = useState(false);
  const [ratingChange, setRatingChange] = useState<number | null>(null);
  const [finalPlayerRating, setFinalPlayerRating] = useState<number | null>(null);
  const [checkFlash, setCheckFlash] = useState<Record<string, React.CSSProperties>>({});
  const [disconnectCountdown, setDisconnectCountdown] = useState<number | null>(null);
  const [selfDisconnectCountdown, setSelfDisconnectCountdown] = useState<number | null>(null);
  const [autoAbortCountdown, setAutoAbortCountdown] = useState<number | null>(null);
  const [prizeClaimed, setPrizeClaimed] = useState(false);
  const [settlementFailed, setSettlementFailed] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [rematchRequestPending, setRematchRequestPending] = useState(false);
  const [timerSyncedAtMs, setTimerSyncedAtMs] = useState(() => Date.now());
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const [timerTurn, setTimerTurn] = useState<"w" | "b">("w");

  const router = useRouter();
  const { address } = useAccount();
  const { socket } = useSocket(address ?? undefined);
  const { boardTheme } = useBoardTheme();
  const { useCustomPiecesOnMobile } = useBoardPieces();
  const { playMoveSound, playGameOver, playLowTime } = useChessSounds();
  const { claimPrizeSingle, isLoading: isClaimLoading } = useChessdict();

  useEffect(() => {
    const updateViewport = () => {
      setIsMobileViewport(window.innerWidth < 640);
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);


  // Initialize the chess instance once and keep it stable.
  // We use fen as the source of truth for React rendering.
  const game = useMemo(() => new Chess(), []);
  const [fen, setFen] = useState(game.fen());
  const isMultiplayer = gameMode === "online" || gameMode === "friend";
  const effectiveColor = playerColor || (gameMode === "computer" ? "white" : undefined);
  const playerTurnCode = effectiveColor ? (effectiveColor === "black" ? "b" : "w") : null;
  const applyDisconnectGraceState = useCallback((deadline: number | null, disconnectedWallets: string[] = []) => {
    const normalizedAddress = address?.toLowerCase() ?? null;
    const normalizedWallets = disconnectedWallets.map((wallet) => wallet.toLowerCase());
    const selfDisconnected = normalizedAddress
      ? normalizedWallets.includes(normalizedAddress)
      : false;
    const opponentDisconnected = normalizedAddress
      ? normalizedWallets.some((wallet) => wallet !== normalizedAddress)
      : normalizedWallets.length > 0;

    setSelfDisconnectDeadline(selfDisconnected ? deadline : null);
    setOpponentDisconnectDeadline(opponentDisconnected ? deadline : null);
    if (isMultiplayer) {
      setOpponentConnected(!opponentDisconnected);
    }
  }, [address, isMultiplayer, setOpponentConnected, setOpponentDisconnectDeadline, setSelfDisconnectDeadline]);
  const chessboardId = useMemo(() => `game-board-${roomId ?? gameMode ?? "local"}`, [gameMode, roomId]);
  const isStakedMatch = !!stakeToken || !!stakeAmountRaw || onChainGameId !== null;
  const canRequestRematch =
    status === "finished" &&
    isMultiplayer &&
    !isStakedMatch;
  const boardPieces = isMobileViewport && !useCustomPiecesOnMobile ? defaultPieces : customPieces;
  const boardAnimationsEnabled = !(isMobileViewport && useCustomPiecesOnMobile);

  // Diagnostic state to show in UI
  const [lastMove, setLastMove] = useState<Move | null>(null);

  // State for move highlighting
  const [moveSquares, setMoveSquares] = useState<Record<string, React.CSSProperties>>({});
  const [sourceSquare, setSourceSquare] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const [queuedPremove, setQueuedPremove] = useState<Premove | null>(null);
  const [promotionSelection, setPromotionSelection] = useState<PromotionSelection | null>(null);
  // State for last move highlighting (persists between moves)
  const [lastMoveSquares, setLastMoveSquares] = useState<Record<string, React.CSSProperties>>({});
  const sourceSquareRef = useRef<string | null>(null);
  const selectionModeRef = useRef<SelectionMode>(null);
  const revalidateSelectionRef = useRef<(() => void) | null>(null);
  const dragInteractionRef = useRef(false);
  const dragStartedAtRef = useRef(0);
  const lastSnapshotRequestAtRef = useRef(0);
  const pendingSnapshotRequestRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [boardKey, setBoardKey] = useState(0);

  const resetBoardInteraction = useCallback(() => {
    setBoardKey((previous) => previous + 1);
  }, []);

  const clearDragInteraction = useCallback(() => {
    dragInteractionRef.current = false;
    dragStartedAtRef.current = 0;
  }, []);

  const clearPendingSnapshotRequest = useCallback(() => {
    if (pendingSnapshotRequestRef.current) {
      clearTimeout(pendingSnapshotRequestRef.current);
      pendingSnapshotRequestRef.current = null;
    }
  }, []);

  const requestGameSnapshot = useCallback((reason: string) => {
    if (!socket || !roomId || !isMultiplayer) return;

    const now = Date.now();
    if (now - lastSnapshotRequestAtRef.current < 750) {
      return;
    }

    lastSnapshotRequestAtRef.current = now;
    console.warn(`[CLIENT] Requesting game snapshot for ${roomId}: ${reason}`);
    socket.emit("requestGameSnapshot", { roomId, reason });
  }, [isMultiplayer, roomId, socket]);

  const hasBrokenDragInteraction = useCallback(() => {
    if (!dragInteractionRef.current) return false;

    // Only recover drags that are still marked active well after the browser
    // should have completed the touch/pointer lifecycle.
    return Date.now() - dragStartedAtRef.current < 2500;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handlePointerLifecycleEnd = () => {
      clearDragInteraction();
    };

    window.addEventListener("pointerup", handlePointerLifecycleEnd, true);
    window.addEventListener("pointercancel", handlePointerLifecycleEnd, true);
    window.addEventListener("touchend", handlePointerLifecycleEnd, true);
    window.addEventListener("touchcancel", handlePointerLifecycleEnd, true);
    window.addEventListener("mouseup", handlePointerLifecycleEnd, true);

    return () => {
      window.removeEventListener("pointerup", handlePointerLifecycleEnd, true);
      window.removeEventListener("pointercancel", handlePointerLifecycleEnd, true);
      window.removeEventListener("touchend", handlePointerLifecycleEnd, true);
      window.removeEventListener("touchcancel", handlePointerLifecycleEnd, true);
      window.removeEventListener("mouseup", handlePointerLifecycleEnd, true);
    };
  }, [clearDragInteraction]);

  useEffect(() => {
    return () => {
      clearPendingSnapshotRequest();
    };
  }, [clearPendingSnapshotRequest]);

  // Compute persistent check highlight from current position
  const checkSquare = useMemo<Record<string, React.CSSProperties>>(() => {
    if (!game.isCheck()) return {};
    const turn = game.turn();
    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type === 'k' && piece.color === turn) {
          const file = String.fromCharCode(97 + c);
          const rank = String(8 - r);
          return { [`${file}${rank}`]: { background: "radial-gradient(circle, rgba(255,0,0,0.4) 50%, transparent 100%)" } };
        }
      }
    }
    return {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  // Helper to sync the state with the game instance
  const syncState = useCallback(() => {
    setFen(game.fen());
  }, [game]);

  const clearSelection = useCallback(() => {
    sourceSquareRef.current = null;
    selectionModeRef.current = null;
    setMoveSquares({});
    setSourceSquare(null);
    setSelectionMode(null);
  }, []);

  const setActiveSelection = useCallback((square: string, mode: Exclude<SelectionMode, null>) => {
    sourceSquareRef.current = square;
    selectionModeRef.current = mode;
    setSourceSquare(square);
    setSelectionMode(mode);
  }, []);

  useEffect(() => {
    sourceSquareRef.current = sourceSquare;
    selectionModeRef.current = selectionMode;
  }, [sourceSquare, selectionMode]);

  const safeMove = useCallback((move: any, options?: { preserveSelection?: boolean; resetBoardInteraction?: boolean; soundPerspective?: "self" | "opponent" }) => {
    try {
      const result = game.move(move);
      if (result) {
        syncState();
        setLastMove(result);
        // Record move in store for move history display
        addMove({
          san: result.san,
          from: result.from,
          to: result.to,
          color: result.color,
          piece: result.piece,
          timestamp: Date.now(),
        });

        // Highlight the last move squares
        setLastMoveSquares({
          [result.from]: { background: "rgba(255, 255, 0, 0.3)" },
          [result.to]: { background: "rgba(255, 255, 0, 0.4)" },
        });

        if (options?.preserveSelection) {
          revalidateSelectionRef.current?.();
        } else {
          clearSelection();
        }

        // Only remount when an external move lands while a stale drag is still active.
        if (options?.resetBoardInteraction && hasBrokenDragInteraction()) {
          resetBoardInteraction();
        }
        clearDragInteraction();

        // Play sound based on move type
        playMoveSound(result, options?.soundPerspective ?? "self");

        return result;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }, [game, syncState, addMove, clearSelection, playMoveSound, resetBoardInteraction, clearDragInteraction, hasBrokenDragInteraction]);

  const emitPlayerMove = useCallback((move: Premove, result: Move) => {
    if (!isMultiplayer || !roomId) return;

    socket?.emit("movePiece", {
      roomId,
      move,
      fen: game.fen(),
      moveRecord: {
        san: result.san,
        from: result.from,
        to: result.to,
        color: result.color,
        piece: result.piece,
        timestamp: Date.now(),
      },
    });
  }, [game, isMultiplayer, roomId, socket]);

  const playPlayerMove = useCallback((move: Premove) => {
    const result = safeMove(move);
    if (!result) return null;

    emitPlayerMove(move, result);
    return result;
  }, [emitPlayerMove, safeMove]);

  const queuePremove = useCallback((move: Premove) => {
    setQueuedPremove((current) =>
      current && current.from === move.from && current.to === move.to ? null : move,
    );
    clearSelection();
  }, [clearSelection]);

  const clearQueuedPremove = useCallback(() => {
    setQueuedPremove(null);
    clearSelection();
  }, [clearSelection]);

  const requestPromotion = useCallback((from: string, to: string) => {
    const selection = getPromotionSelection(game, from, to);
    if (!selection) return false;

    setPromotionSelection(selection);
    clearSelection();
    return true;
  }, [clearSelection, game]);

  const cancelPromotionSelection = useCallback(() => {
    setPromotionSelection(null);
    clearSelection();
  }, [clearSelection]);

  const handlePromotionSelect = useCallback((promotion: PromotionPiece) => {
    if (!promotionSelection) return;

    playPlayerMove({
      from: promotionSelection.from,
      to: promotionSelection.to,
      promotion,
    });
    setPromotionSelection(null);
  }, [playPlayerMove, promotionSelection]);

  const premoveSquares = useMemo<Record<string, React.CSSProperties>>(() => {
    return {};
  }, []);

  const queuedPremovePieceCode = useMemo(() => {
    if (!queuedPremove) return null;

    const sourcePiece = game.get(queuedPremove.from as any);
    if (!sourcePiece) return null;

    const promotedPiece =
      sourcePiece.type === "p" &&
      queuedPremove.promotion &&
      isPromotionDestination(queuedPremove.to, sourcePiece.color)
        ? queuedPremove.promotion
        : sourcePiece.type;

    return `${sourcePiece.color}${promotedPiece.toUpperCase()}`;
  }, [fen, game, queuedPremove]);

  // Handle Game Initialization / Resets
  useEffect(() => {
    if (status === "waiting") {
      game.reset();
      syncState();
      setLastMove(null);
      setCheckFlash({});
      setRatingChange(null);
      setDisconnectCountdown(null);
      setSelfDisconnectDeadline(null);
      setSelfDisconnectCountdown(null);
      setPrizeClaimed(false);
      setSettlementFailed(false);
      setGameResultModalDismissed(false);
      clearMoves();
      resetTimers();
      clearSelection();
      setQueuedPremove(null);
      setPromotionSelection(null);
      setLastMoveSquares({});
      setTimerSyncedAtMs(Date.now());
      setClockNowMs(Date.now());
      setTimerTurn("w");
      clearDragInteraction();
      resetBoardInteraction();
    }
  }, [status, game, syncState, clearMoves, resetTimers, clearSelection, setGameResultModalDismissed, resetBoardInteraction, clearDragInteraction]);

  const previousRoomIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (roomId && previousRoomIdRef.current && roomId !== previousRoomIdRef.current) {
      game.reset();
      syncState();
      setLastMove(null);
      setCheckFlash({});
      setRatingChange(null);
      setDisconnectCountdown(null);
      setSelfDisconnectDeadline(null);
      setSelfDisconnectCountdown(null);
      setPrizeClaimed(false);
      setSettlementFailed(false);
      setGameResultModalDismissed(false);
      clearGameOver();
      clearSelection();
      setQueuedPremove(null);
      setPromotionSelection(null);
      setLastMoveSquares({});
      setTimerSyncedAtMs(Date.now());
      setClockNowMs(Date.now());
      setTimerTurn("w");
      clearDragInteraction();
      resetBoardInteraction();
    }

    previousRoomIdRef.current = roomId;
  }, [roomId, game, syncState, clearGameOver, clearSelection, setGameResultModalDismissed, resetBoardInteraction, clearDragInteraction]);

  // Load rejoined game state (after browser refresh reconnection)
  useEffect(() => {
    if (status === "in-progress" && rejoinFen) {
      try {
        game.load(rejoinFen);
        syncState();
        clearMoves();
        rejoinMoves.forEach(m => addMove(m));
        clearSelection();
        setQueuedPremove(null);
        setPromotionSelection(null);
        setTimerSyncedAtMs(Date.now());
        setClockNowMs(Date.now());
        setTimerTurn(normalizeClockTurn(game.turn()));
        clearDragInteraction();
        resetBoardInteraction();
        clearRejoinData();
        console.log("[CLIENT] Rejoined game state loaded, FEN:", rejoinFen);
      } catch (e) {
        console.error("[CLIENT] Failed to load rejoin FEN:", e);
        clearRejoinData();
      }
    }
  }, [status, rejoinFen, rejoinMoves, game, syncState, clearMoves, addMove, clearRejoinData, clearSelection, resetBoardInteraction, clearDragInteraction]);

  // If the board component remounts mid-game before a fresh rejoin snapshot lands,
  // rebuild the internal chess instance from the store move history so the board
  // does not flash back to the starting position.
  useEffect(() => {
    if (status !== "in-progress" || rejoinFen || storeMoves.length === 0) {
      return;
    }

    if (game.history().length > 0) {
      return;
    }

    try {
      game.reset();
      for (const move of storeMoves) {
        const applied =
          typeof move.san === "string" && move.san
            ? game.move(move.san)
            : game.move({ from: move.from, to: move.to });
        if (!applied) {
          throw new Error(`Failed to replay move ${move.san ?? `${move.from}-${move.to}`}`);
        }
      }

      syncState();
      setLastMoveSquares({});
      const lastStoreMove = storeMoves[storeMoves.length - 1];
      if (lastStoreMove) {
        setLastMoveSquares({
          [lastStoreMove.from]: { background: "rgba(255, 255, 0, 0.3)" },
          [lastStoreMove.to]: { background: "rgba(255, 255, 0, 0.4)" },
        });
      }
      setTimerTurn(normalizeClockTurn(game.turn()));
      clearSelection();
      clearDragInteraction();
      resetBoardInteraction();
    } catch (error) {
      console.error("[CLIENT] Failed to rebuild board from move history:", error);
      requestGameSnapshot("rebuild-from-store-failed");
    }
  }, [
    clearDragInteraction,
    clearSelection,
    game,
    rejoinFen,
    requestGameSnapshot,
    resetBoardInteraction,
    status,
    storeMoves,
    syncState,
  ]);

  useEffect(() => {
    if (status !== "in-progress" || gameOver) {
      clearSelection();
      setQueuedPremove(null);
      setPromotionSelection(null);
      setSelfDisconnectDeadline(null);
    }
  }, [status, gameOver, clearSelection, setSelfDisconnectDeadline]);

  // Opponent disconnect countdown ticker
  useEffect(() => {
    if (!opponentDisconnectDeadline) {
      setDisconnectCountdown(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((opponentDisconnectDeadline - Date.now()) / 1000));
      setDisconnectCountdown(remaining);
      if (remaining <= 0) setOpponentDisconnectDeadline(null);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [opponentDisconnectDeadline, setOpponentDisconnectDeadline]);

  useEffect(() => {
    if (!selfDisconnectDeadline) {
      setSelfDisconnectCountdown(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((selfDisconnectDeadline - Date.now()) / 1000));
      setSelfDisconnectCountdown(remaining);
      if (remaining <= 0) setSelfDisconnectDeadline(null);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [selfDisconnectDeadline, setSelfDisconnectDeadline]);

  useEffect(() => {
    if (!autoAbortDeadline || isStakedMatch || status !== "in-progress" || storeMoves.length > 0) {
      setAutoAbortCountdown(null);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((autoAbortDeadline - Date.now()) / 1000));
      setAutoAbortCountdown(remaining);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [autoAbortDeadline, isStakedMatch, status, storeMoves.length]);

  useEffect(() => {
    if (!isMultiplayer || status !== "in-progress" || gameOver) return;

    const interval = setInterval(() => {
      setClockNowMs(Date.now());
    }, 100);

    return () => clearInterval(interval);
  }, [gameOver, isMultiplayer, status]);

  const displayedTimes = useMemo(() => {
    let displayedWhiteTime = whiteTime;
    let displayedBlackTime = blackTime;

    if (isMultiplayer && status === "in-progress" && !gameOver && storeMoves.length > 0) {
      const elapsedSeconds = Math.max(0, (clockNowMs - timerSyncedAtMs) / 1000);

      if (timerTurn === "w") {
        displayedWhiteTime = Math.max(0, whiteTime - elapsedSeconds);
      } else {
        displayedBlackTime = Math.max(0, blackTime - elapsedSeconds);
      }
    }

    return {
      whiteTime: displayedWhiteTime,
      blackTime: displayedBlackTime,
    };
  }, [blackTime, clockNowMs, gameOver, isMultiplayer, status, storeMoves.length, timerSyncedAtMs, timerTurn, whiteTime]);

  useEffect(() => {
    if (!isMultiplayer || status !== "in-progress" || gameOver) return;

    const currentTurn = normalizeClockTurn(game.turn());
    if (currentTurn === timerTurn) return;

    // Freeze the elapsed time on the side that just moved, then start the new turn
    // from a fresh synchronized local baseline until the next server timeSync arrives.
    setWhiteTime(displayedTimes.whiteTime);
    setBlackTime(displayedTimes.blackTime);
    setTimerTurn(currentTurn);
    setTimerSyncedAtMs(Date.now());
    setClockNowMs(Date.now());
  }, [displayedTimes.blackTime, displayedTimes.whiteTime, game, gameOver, isMultiplayer, status, timerTurn, fen, setBlackTime, setWhiteTime]);

  // Timer countdown logic
  useEffect(() => {
    if (gameMode !== "computer") return;
    if (status !== "in-progress") return;
    if (gameOver) return;

    const currentTurnForTimer = game.turn(); // 'w' or 'b'

    const interval = setInterval(() => {
      if (currentTurnForTimer === 'w') {
        decrementWhiteTime();
      } else {
        decrementBlackTime();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [status, gameOver, game, fen, gameMode, decrementWhiteTime, decrementBlackTime]);

  // Handle timeout (time runs out)
  useEffect(() => {
    if (gameMode !== "computer") return;
    if (status !== "in-progress") return;
    if (gameOver) return;

    const currentTurnForTimer = game.turn();
    const timeoutPlayer = currentTurnForTimer === 'w' ? whiteTime : blackTime;

    if (timeoutPlayer <= 0) {
      const winner = currentTurnForTimer === 'w' ? 'black' : 'white';
      console.log(`[CLIENT] Timeout! ${winner} wins`);

      setGameOver(winner, "timeout");
      setStatus("finished");
      playGameOver();
    }
  }, [whiteTime, blackTime, status, gameOver, game, gameMode, socket, roomId, setGameOver, setStatus, playGameOver]);

  // Low time warning sound
  const lowTimeAlertedRef = useRef<{ white: boolean; black: boolean }>({ white: false, black: false });
  useEffect(() => {
    if (status !== "in-progress" || gameOver) return;

    const myColor = playerColor || 'white';

    // Only alert for the player's own time
    const myTime = myColor === 'white' ? displayedTimes.whiteTime : displayedTimes.blackTime;
    const key = myColor as 'white' | 'black';

    if (myTime <= LOW_TIME_SOUND_THRESHOLD_SECONDS && myTime > 0 && !lowTimeAlertedRef.current[key]) {
      lowTimeAlertedRef.current[key] = true;
      playLowTime();
    }
    // Reset alert if time goes back above threshold (e.g. reconnect)
    if (myTime > LOW_TIME_SOUND_THRESHOLD_SECONDS) {
      lowTimeAlertedRef.current[key] = false;
    }
  }, [displayedTimes.blackTime, displayedTimes.whiteTime, status, gameOver, playerColor, playLowTime]);

  // Bot Logic
  useEffect(() => {
    if (status !== "in-progress" || gameMode !== "computer") return;

    const turn = game.turn();
    // In computer mode, player is white by default if not set
    const myColor = playerColor || 'white';
    const botTurnCode = myColor === 'white' ? 'b' : 'w';

    if (turn === botTurnCode) {
      const timeoutId = setTimeout(() => {
        const move = getBestMove(new Chess(game.fen()), difficulty);
        if (move) {
          safeMove(move, { preserveSelection: true, resetBoardInteraction: true, soundPerspective: "opponent" });
        }
      }, 600);
      return () => clearTimeout(timeoutId);
    }
  }, [fen, status, gameMode, playerColor, difficulty, game, safeMove]);

  // Check for game over (checkmate, stalemate, draw) after each move
  useEffect(() => {
    if (status !== "in-progress") return;
    if (!game.isGameOver()) return;

    let winner: "white" | "black" | "draw" | null = null;
    let reason: "checkmate" | "stalemate" | "draw" | null = null;

    if (game.isCheckmate()) {
      // The player whose turn it is has been checkmated (they lost)
      const loserColor = game.turn(); // 'w' or 'b'
      winner = loserColor === 'w' ? 'black' : 'white';
      reason = "checkmate";
      console.log(`[CLIENT] Checkmate detected! Winner: ${winner}`);
    } else if (game.isStalemate()) {
      winner = "draw";
      reason = "stalemate";
      console.log("[CLIENT] Stalemate detected!");
    } else if (game.isDraw()) {
      winner = "draw";
      reason = "draw";
      console.log("[CLIENT] Draw detected!");
    }

    if (winner && reason) {
      // For multiplayer games, notify the server
      const isMultiplayer = gameMode === 'online' || gameMode === 'friend';
      if (isMultiplayer && socket && roomId) {
        console.log("[CLIENT] Emitting gameComplete event:", { roomId, winner, reason });
        socket.emit("gameComplete", { roomId, winner, reason });
      }

      // Update local state
      setGameOver(winner, reason);
      setStatus("finished");
      playGameOver();
    }
  }, [fen, status, game, gameMode, socket, roomId, setGameOver, setStatus, playGameOver]);

  // Network Logic - Listen for opponent moves
  useEffect(() => {
    const isMultiplayer = gameMode === 'online' || gameMode === 'friend';
    if (!socket || !isMultiplayer || !roomId) return;

    const handleOpponentMove = (payload: any) => {
      const localMoveCount = useGameStore.getState().moves.length;
      const incomingMove = payload?.move ?? payload;
      const incomingVersion =
        typeof payload?.version === "number" && Number.isFinite(payload.version)
          ? payload.version
          : null;

      if (incomingVersion !== null) {
        if (incomingVersion <= localMoveCount) {
          return;
        }

        if (incomingVersion !== localMoveCount + 1) {
          requestGameSnapshot(`opponent-move-gap:${localMoveCount}->${incomingVersion}`);
          return;
        }
      }

      clearPendingSnapshotRequest();
      const result = safeMove(incomingMove, {
        preserveSelection: true,
        resetBoardInteraction: true,
        soundPerspective: "opponent",
      });

      if (!result) {
        requestGameSnapshot("opponent-move-apply-failed");
        return;
      }

      if (
        typeof payload?.turn === "string" &&
        normalizeClockTurn(payload.turn) !== normalizeClockTurn(game.turn())
      ) {
        requestGameSnapshot("turn-mismatch-after-opponent-move");
      }
    };

    socket.on('opponentMove', handleOpponentMove);
    return () => { socket.off('opponentMove', handleOpponentMove); };
  }, [socket, gameMode, roomId, safeMove, requestGameSnapshot, clearPendingSnapshotRequest, game]);

  useEffect(() => {
    if (!queuedPremove || status !== "in-progress" || game.isGameOver() || !playerTurnCode) {
      return;
    }

    if (game.turn() !== playerTurnCode) return;

    const pendingMove = queuedPremove;
    setQueuedPremove(null);
    playPlayerMove(pendingMove);
  }, [fen, game, playerTurnCode, playPlayerMove, queuedPremove, status]);

  useEffect(() => {
    setRematchRequestPending(false);
  }, [roomId, status]);

  useEffect(() => {
    setRatingChange(null);
    setFinalPlayerRating(null);
  }, [roomId]);

  // Track opponent connection status and Game Over events
  useEffect(() => {
    const isMultiplayer = gameMode === 'online' || gameMode === 'friend';
    if (!socket || !isMultiplayer || !roomId) return;

    const handleOpponentJoined = () => {
      setOpponentConnected(true);
    };

    const handleOpponentLeft = () => {
      setOpponentConnected(false);
    };

    const handleGameOver = ({ winner, reason, ratings, settlementFailed: settFailed }: { winner: "white" | "black" | "draw" | "opponent"; reason: any; ratings?: Record<string, number>; settlementFailed?: boolean }) => {
      console.log("[CLIENT] gameOver event received:", { winner, reason, ratings, settlementFailed: settFailed });
      setGameOver(winner, reason);
      setStatus("finished");
      setAutoAbortDeadline(null);
      setGameResultModalDismissed(false);
      playGameOver();
      if (settFailed) {
        setSettlementFailed(true);
      }
      if (ratings && address) {
        const newRating = ratings[address];
        const oldRating = matchPlayerRatingBaseline ?? player?.rating;
        if (newRating !== undefined && oldRating !== undefined) {
          setRatingChange(newRating - oldRating);
          setFinalPlayerRating(newRating);
          if (player) {
            setPlayer({
              ...player,
              rating: newRating,
            });
          }
        }
      }
    };

    const handleDrawOffered = () => {
      console.log("[CLIENT] Draw offer received from opponent");
      setDrawOfferReceived(true);
    };

    const handleDrawDeclined = () => {
      console.log("[CLIENT] Draw offer declined by opponent");
      setDrawOfferSent(false);
    };

    const handleDrawCancelled = () => {
      console.log("[CLIENT] Draw offer cancelled by opponent");
      setDrawOfferReceived(false);
    };

    const handleResignError = ({ error }: { error: string }) => {
      console.error("[CLIENT] resignError event received:", error);
      alert(`Failed to resign: ${error}`);
    };

    const handlePong = (data: { timestamp: number }) => {
      const now = Date.now();
      const rtt = now - data.timestamp;
      setPing(rtt);
    };

    const handleOpponentPing = (data: { ping: number }) => {
      setOpponentPing(data.ping);
    };

    const handleTimeSync = (data: {
      whiteTime: number;
      blackTime: number;
      initialTime?: number;
      turn?: "w" | "b";
      version?: number;
    }) => {
      const localMoveCount = useGameStore.getState().moves.length;
      if (typeof data.version === "number" && Number.isFinite(data.version)) {
        if (data.version < localMoveCount) {
          return;
        }

        if (data.version > localMoveCount) {
          clearPendingSnapshotRequest();
          pendingSnapshotRequestRef.current = setTimeout(() => {
            const latestMoveCount = useGameStore.getState().moves.length;
            if (latestMoveCount < data.version!) {
              requestGameSnapshot(`time-sync-gap:${latestMoveCount}->${data.version}`);
            }
          }, 450);
        } else {
          clearPendingSnapshotRequest();
        }
      }

      const {
        initialTime: currentInitialTime,
        whiteTime: curWhite,
        blackTime: curBlack,
      } = useGameStore.getState();
      const syncedInitialTime =
        typeof data.initialTime === "number" && data.initialTime > 0
          ? data.initialTime
          : Math.max(currentInitialTime, data.whiteTime, data.blackTime);
      const newWhite = Math.min(data.whiteTime, syncedInitialTime);
      const newBlack = Math.min(data.blackTime, syncedInitialTime);

      if (syncedInitialTime !== currentInitialTime) {
        setClockConfig(syncedInitialTime);
      }
      if (syncedInitialTime > currentInitialTime || newWhite <= curWhite) {
        setWhiteTime(newWhite);
      }
      if (syncedInitialTime > currentInitialTime || newBlack <= curBlack) {
        setBlackTime(newBlack);
      }
      setTimerTurn(normalizeClockTurn(data.turn ?? game.turn()));
      setTimerSyncedAtMs(Date.now());
      setClockNowMs(Date.now());
    };

    const handleGameSnapshot = (data: {
      roomId: string;
      fen: string;
      moves: any[];
      whiteTime: number;
      blackTime: number;
      initialTime?: number;
      turn?: "w" | "b";
      autoAbortDeadline?: number | null;
      disconnectGrace?: {
        deadline: number;
        disconnectedWallets: string[];
      } | null;
    }) => {
      if (data.roomId !== roomId) return;

      clearPendingSnapshotRequest();
      const currentInitialTime = useGameStore.getState().initialTime;
      const syncedInitialTime =
        typeof data.initialTime === "number" && data.initialTime > 0
          ? data.initialTime
          : Math.max(currentInitialTime, data.whiteTime, data.blackTime);

      if (syncedInitialTime !== currentInitialTime) {
        setClockConfig(syncedInitialTime);
      }

      setWhiteTime(Math.min(data.whiteTime, syncedInitialTime));
      setBlackTime(Math.min(data.blackTime, syncedInitialTime));
      setTimerTurn(normalizeClockTurn(data.turn ?? game.turn()));
      setTimerSyncedAtMs(Date.now());
      setClockNowMs(Date.now());
      setRejoinData(data.fen, Array.isArray(data.moves) ? data.moves : []);
      setAutoAbortDeadline(data.autoAbortDeadline ?? null);
      applyDisconnectGraceState(
        data.disconnectGrace?.deadline ?? null,
        data.disconnectGrace?.disconnectedWallets ?? [],
      );
    };

    const handleOpponentDisconnecting = (data: { deadline: number }) => {
      console.log("[CLIENT] Opponent disconnecting, deadline:", data.deadline);
      setOpponentConnected(false);
      setOpponentDisconnectDeadline(data.deadline);
    };

    const handleOpponentReconnected = () => {
      console.log("[CLIENT] Opponent reconnected");
      setOpponentConnected(true);
      setOpponentDisconnectDeadline(null);
    };

    const handleDisconnectGraceState = (data: {
      roomId?: string;
      deadline: number;
      disconnectedWallets: string[];
      turn?: "w" | "b";
    }) => {
      if (data.roomId && data.roomId !== roomId) return;
      applyDisconnectGraceState(data.deadline, data.disconnectedWallets);
    };

    const handleDisconnectGraceCleared = (data?: { roomId?: string }) => {
      if (data?.roomId && data.roomId !== roomId) return;
      setSelfDisconnectDeadline(null);
      setOpponentDisconnectDeadline(null);
      setOpponentConnected(true);
    };

    // Ping interval
    const pingInterval = setInterval(() => {
      socket.emit("ping", { timestamp: Date.now() });
    }, 5000);

    // Set connected when we have an opponent
    if (opponent) {
      setOpponentConnected(true);
    }

    console.log("[CLIENT] Setting up socket listeners for room:", roomId);
    socket.on('opponentJoined', handleOpponentJoined);
    socket.on('opponentLeft', handleOpponentLeft);
    socket.on('gameOver', handleGameOver);
    socket.on('pong', handlePong);
    socket.on('opponentPing', handleOpponentPing);
    socket.on('resignError', handleResignError);
    socket.on('drawOffered', handleDrawOffered);
    socket.on('drawDeclined', handleDrawDeclined);
    socket.on('drawCancelled', handleDrawCancelled);
    socket.on('timeSync', handleTimeSync);
    socket.on('gameSnapshot', handleGameSnapshot);
    socket.on('opponentDisconnecting', handleOpponentDisconnecting);
    socket.on('opponentReconnected', handleOpponentReconnected);
    socket.on('disconnectGraceState', handleDisconnectGraceState);
    socket.on('disconnectGraceCleared', handleDisconnectGraceCleared);

    return () => {
      clearInterval(pingInterval);
      socket.off('opponentJoined', handleOpponentJoined);
      socket.off('opponentLeft', handleOpponentLeft);
      socket.off('gameOver', handleGameOver);
      socket.off('pong', handlePong);
      socket.off('opponentPing', handleOpponentPing);
      socket.off('resignError', handleResignError);
      socket.off('drawOffered', handleDrawOffered);
      socket.off('drawDeclined', handleDrawDeclined);
      socket.off('drawCancelled', handleDrawCancelled);
      socket.off('timeSync', handleTimeSync);
      socket.off('gameSnapshot', handleGameSnapshot);
      socket.off('opponentDisconnecting', handleOpponentDisconnecting);
      socket.off('opponentReconnected', handleOpponentReconnected);
      socket.off('disconnectGraceState', handleDisconnectGraceState);
      socket.off('disconnectGraceCleared', handleDisconnectGraceCleared);
    };
  }, [socket, gameMode, roomId, opponent, setOpponentConnected, setGameOver, setStatus, setDrawOfferReceived, setDrawOfferSent, playGameOver, address, matchPlayerRatingBaseline, player, setPlayer, setWhiteTime, setBlackTime, setOpponentDisconnectDeadline, setSelfDisconnectDeadline, setAutoAbortDeadline, setGameResultModalDismissed, setClockConfig, game, applyDisconnectGraceState, clearPendingSnapshotRequest, requestGameSnapshot, setRejoinData]);

  useEffect(() => {
    if (!socket || !roomId || !canRequestRematch) return;

    const handleRematchPending = (data: { roomId: string }) => {
      if (data.roomId !== roomId) return;
      setRematchRequestPending(true);
    };

    const clearPendingState = (data: { roomId: string }) => {
      if (data.roomId !== roomId) return;
      setRematchRequestPending(false);
    };

    socket.on("rematchPending", handleRematchPending);
    socket.on("rematchDeclined", clearPendingState);
    socket.on("rematchUnavailable", clearPendingState);
    socket.on("rematchExpired", clearPendingState);
    socket.on("rematchRequested", clearPendingState);

    return () => {
      socket.off("rematchPending", handleRematchPending);
      socket.off("rematchDeclined", clearPendingState);
      socket.off("rematchUnavailable", clearPendingState);
      socket.off("rematchExpired", clearPendingState);
      socket.off("rematchRequested", clearPendingState);
    };
  }, [canRequestRematch, roomId, socket]);

  const handleRequestRematch = useCallback(() => {
    if (!socket || !roomId || !canRequestRematch || rematchRequestPending) return;
    setRematchRequestPending(true);
    socket.emit("requestRematch", { roomId });
  }, [canRequestRematch, rematchRequestPending, roomId, socket]);

  const handlePostGamePlayAgain = useCallback(() => {
    if (socket && roomId) {
      socket.emit("leaveRoom", { roomId });
    }
    resetStore();
    if (gameMode === "online" && !isStakedMatch) {
      router.push(`/play?autoQueue=online&timeControl=${Math.max(1, Math.round(initialTime / 60))}`);
      return;
    }
    router.push("/play");
  }, [gameMode, initialTime, isStakedMatch, resetStore, roomId, router, socket]);

  // Flash the king square red when in check and player tries an invalid action
  const flashKingCheck = useCallback(() => {
    if (!game.isCheck()) return;
    const turn = game.turn();
    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type === 'k' && piece.color === turn) {
          const file = String.fromCharCode(97 + c);
          const rank = String(8 - r);
          const kingSquare = `${file}${rank}`;
          setCheckFlash({
            [kingSquare]: {
              background: "radial-gradient(circle, rgba(255,0,0,0.6) 60%, rgba(255,0,0,0.2) 100%)",
              borderRadius: "50%",
            },
          });
          setTimeout(() => setCheckFlash({}), 500);
          return;
        }
      }
    }
  }, [game]);

  // Calculate and style possible moves
  const getMoveOptions = useCallback((square: string) => {
    if (!playerTurnCode) return false;

    const turn = game.turn();
    const piece = game.get(square as any);

    if (!piece || piece.color !== turn || piece.color !== playerTurnCode) {
      return false;
    }

    const moves = game.moves({
      square: square as any,
      verbose: true,
    });

    if (moves.length === 0) {
      setMoveSquares({});
      flashKingCheck();
      return false;
    }

    const newSquares: Record<string, React.CSSProperties> = {};

    moves.forEach((move: any) => {
      const targetPiece = game.get(move.to);
      newSquares[move.to] = {
        background:
          targetPiece && targetPiece.color !== piece.color
            ? "radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)"
            : "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
        borderRadius: "50%",
      };
    });

    newSquares[square] = {
      background: "rgba(255, 255, 0, 0.4)",
    };

    setMoveSquares(newSquares);
    return true;
  }, [flashKingCheck, game, playerTurnCode]);

  const getPremoveOptions = useCallback((square: string) => {
    if (!playerTurnCode || game.turn() === playerTurnCode) return false;

    const piece = game.get(square as any);
    if (!piece || piece.color !== playerTurnCode) return false;

    const targets = getPremoveTargets(game, square);
    if (targets.length === 0) {
      setMoveSquares({});
      return false;
    }

    const newSquares: Record<string, React.CSSProperties> = {};

    targets.forEach((target) => {
      const targetPiece = game.get(target as any);
      newSquares[target] = {
        background:
          targetPiece
            ? "radial-gradient(circle, rgba(59,130,246,0.22) 72%, transparent 74%)"
            : "radial-gradient(circle, rgba(59,130,246,0.32) 24%, transparent 26%)",
        borderRadius: "50%",
      };
    });

    newSquares[square] = {
      background: "rgba(59, 130, 246, 0.24)",
    };

    setMoveSquares(newSquares);
    return true;
  }, [game, playerTurnCode]);

  const revalidateSelection = useCallback(() => {
    const currentSourceSquare = sourceSquareRef.current;
    const currentSelectionMode = selectionModeRef.current;

    if (!currentSourceSquare || !currentSelectionMode || !playerTurnCode) {
      clearSelection();
      return;
    }

    const piece = game.get(currentSourceSquare as any);
    if (!piece || piece.color !== playerTurnCode) {
      clearSelection();
      return;
    }

    const nextMode: SelectionMode = game.turn() === playerTurnCode ? "move" : "premove";
    const selected =
      nextMode === "move"
        ? getMoveOptions(currentSourceSquare)
        : getPremoveOptions(currentSourceSquare);

    if (!selected) {
      clearSelection();
      return;
    }

    setActiveSelection(currentSourceSquare, nextMode);
  }, [clearSelection, game, getMoveOptions, getPremoveOptions, playerTurnCode, setActiveSelection]);

  useEffect(() => {
    revalidateSelectionRef.current = revalidateSelection;
  }, [revalidateSelection]);

  const tryQueuePremove = useCallback((source: string, target: string) => {
    if (!playerTurnCode || game.turn() === playerTurnCode) return false;

    const piece = game.get(source as any);
    if (!piece || piece.color !== playerTurnCode) return false;
    if (!canSetPremove(game, source, target)) return false;

    queuePremove({ from: source, to: target, promotion: "q" });
    return true;
  }, [game, playerTurnCode, queuePremove]);

  // Handle square clicks for click-to-move and highlighting
  const onSquareClick = ({ square }: { square: string }) => {
    if (status !== "in-progress" || !playerTurnCode || promotionSelection) return;

    const isPlayersTurn = game.turn() === playerTurnCode;

    if (!isPlayersTurn && queuedPremove) {
      clearQueuedPremove();
      return;
    }

    if (sourceSquare) {
      if (sourceSquare === square) {
        clearSelection();
        return;
      }

      if (selectionMode === "move" && isPlayersTurn) {
        const move = game
          .moves({ square: sourceSquare as any, verbose: true })
          .find((candidate: any) => candidate.to === square);

        if (move) {
          if (move.promotion && requestPromotion(sourceSquare, square)) {
            return;
          }
          playPlayerMove({ from: sourceSquare, to: square, promotion: "q" });
          return;
        }
      }

      if (selectionMode === "premove" && !isPlayersTurn && tryQueuePremove(sourceSquare, square)) {
        return;
      }

      const piece = game.get(square as any);
      if (piece && piece.color === playerTurnCode) {
        const selected = isPlayersTurn ? getMoveOptions(square) : getPremoveOptions(square);
        if (selected) {
          setActiveSelection(square, isPlayersTurn ? "move" : "premove");
        }
        return;
      }

      if (selectionMode === "move") {
        flashKingCheck();
      }
      clearSelection();
      return;
    }

    const selected = isPlayersTurn ? getMoveOptions(square) : getPremoveOptions(square);
    if (selected) {
      setActiveSelection(square, isPlayersTurn ? "move" : "premove");
    } else {
      clearSelection();
    }
  };

  // Primary Move Handler for Chessboard (Drag and Drop)
  const onDrop = useCallback((source: string, target: string) => {
    if (status !== "in-progress" || promotionSelection) {
      clearDragInteraction();
      return false;
    }
    if (game.isGameOver()) {
      clearDragInteraction();
      return false;
    }
    if (!playerTurnCode) {
      clearDragInteraction();
      return false;
    }

    if (game.turn() !== playerTurnCode) {
      if (queuedPremove) {
        clearQueuedPremove();
        clearDragInteraction();
        return false;
      }
      tryQueuePremove(source, target);
      clearDragInteraction();
      return false;
    }

    if (requestPromotion(source, target)) {
      clearDragInteraction();
      return false;
    }

    const result = playPlayerMove({ from: source, to: target, promotion: "q" });
    if (!result) {
      clearDragInteraction();
    }
    return !!result;
  }, [clearQueuedPremove, clearDragInteraction, game, playerTurnCode, playPlayerMove, promotionSelection, queuedPremove, requestPromotion, status, tryQueuePremove]);

  // UI Helpers
  // For multiplayer: use the assigned color. For computer: default to white if not set.
  // Compute the position to display: live game or historical view
  const isViewingHistory = viewMoveIndex !== null;
  const displayFen = useMemo(() => {
    if (viewMoveIndex === null) return fen;
    if (viewMoveIndex < 0) return INITIAL_BOARD_FEN;
    const temp = new Chess();
    for (let i = 0; i <= viewMoveIndex && i < storeMoves.length; i++) {
      temp.move(storeMoves[i].san);
    }
    return temp.fen();
  }, [viewMoveIndex, storeMoves, fen]);

  // Board orientation: "black" means black pieces at bottom, "white" means white pieces at bottom
  const orientation: "white" | "black" = effectiveColor === "black" ? "black" : "white";
  const materialBalance = useMemo(() => getMaterialBalance(displayFen), [displayFen]);
  const playerMaterialDisplay = useMemo(() => {
    if (!effectiveColor) return null;

    return getSideMaterialDisplay(materialBalance, effectiveColor);
  }, [effectiveColor, materialBalance]);
  const opponentMaterialDisplay = useMemo(() => {
    if (!effectiveColor) return null;

    return getSideMaterialDisplay(
      materialBalance,
      effectiveColor === "white" ? "black" : "white",
    );
  }, [effectiveColor, materialBalance]);
  const displayedGameReason = useMemo(() => {
    if (!gameOver?.reason) return null;
    if (gameOver.reason !== "draw") return gameOver.reason;
    return getAutomaticDrawReason(game) ?? gameOver.reason;
  }, [fen, game, gameOver]);
  const mobileMovePairs = useMemo(() => {
    const pairs: { moveNumber: number; white?: string; black?: string }[] = [];

    for (let index = 0; index < storeMoves.length; index += 2) {
      pairs.push({
        moveNumber: Math.floor(index / 2) + 1,
        white: storeMoves[index]?.san,
        black: storeMoves[index + 1]?.san,
      });
    }

    return pairs;
  }, [storeMoves]);
  const activeMobileMovePairIndex = useMemo(() => {
    if (mobileMovePairs.length === 0) return -1;
    if (viewMoveIndex === null) return mobileMovePairs.length - 1;
    if (viewMoveIndex < 0) return -1;
    return Math.floor(viewMoveIndex / 2);
  }, [mobileMovePairs.length, viewMoveIndex]);

  useEffect(() => {
    if (playerColor) {
      resetBoardInteraction();
    }
  }, [playerColor, resetBoardInteraction]);

  // Debug: Log state for resign button visibility
  useEffect(() => {
    console.log("[CLIENT] Resign button state check:", { status, gameMode, roomId, address, socketConnected: socket?.connected });
  }, [status, gameMode, roomId, address, socket?.connected]);

  // Handle resign action
  const handleResign = useCallback(() => {
    console.log("[CLIENT] handleResign called");
    console.log("[CLIENT] Emitting resign event:", { roomId, userId: address, socketConnected: socket?.connected });

    if (!socket) {
      console.error("[CLIENT] Socket is not available!");
      return;
    }

    if (!roomId) {
      console.error("[CLIENT] Room ID is not available!");
      return;
    }

    socket.emit("resign", { roomId, userId: address });
    console.log("[CLIENT] Resign event emitted successfully");
    setShowResignModal(false);
  }, [socket, roomId, address]);

  // Handle accepting a draw offer
  const handleAcceptDraw = useCallback(() => {
    if (!socket || !roomId) return;
    socket.emit("acceptDraw", { roomId });
    setDrawOfferReceived(false);
  }, [socket, roomId, setDrawOfferReceived]);

  // Handle declining a draw offer
  const handleDeclineDraw = useCallback(() => {
    if (!socket || !roomId) return;
    socket.emit("declineDraw", { roomId });
    setDrawOfferReceived(false);
  }, [socket, roomId, setDrawOfferReceived]);

  // Determine if it's the player's turn
  const currentTurn = game.turn(); // 'w' or 'b'
  const isMyTurn = !!playerTurnCode && currentTurn === playerTurnCode;
  const opponentDisplayName =
    gameMode === "computer"
      ? "Stockfish"
      : getDisplayName(opponent?.username, opponent?.address, "Waiting...");
  const playerDisplayName = getDisplayName(player?.username, player?.address, "You");
  const ratingField = getRatingFieldForTimeControl(
    Math.max(1, Math.round(initialTime / 60)),
    isStakedMatch,
  );
  const ratingCategoryLabel =
    ratingField === "stakedRating"
      ? "Staked"
      : ratingField === "bulletRating"
        ? "Bullet"
        : ratingField === "rapidRating"
          ? "Rapid"
          : "Blitz";
  const ratingDisplayBase = matchPlayerRatingBaseline ?? player?.rating ?? 1200;
  const ratingDisplayFinal =
    finalPlayerRating ?? (ratingChange !== null ? ratingDisplayBase + ratingChange : ratingDisplayBase);
  const playerNetworkStatus =
    isMultiplayer && status === "in-progress"
      ? selfDisconnectCountdown && selfDisconnectCountdown > 0
        ? `Reconnecting... ${selfDisconnectCountdown}s left`
        : !socket?.connected
          ? "Reconnecting..."
          : ping >= 600
            ? "Network lag"
            : null
      : null;

  return (
    <div className="mx-auto flex w-full max-w-full flex-col gap-0.5 sm:max-w-[clamp(480px,calc(100vh-7rem),1300px)] sm:gap-4">
     <div className="flex flex-col gap-1 rounded-none border-0 bg-transparent px-0 py-0 sm:gap-3 sm:rounded-2xl sm:border sm:border-white/5 sm:bg-[#1A1A1A]/80 sm:px-5 sm:py-4">
      {/* Top Info (Opponent) */}
      <div className="flex items-center justify-between px-0.5 sm:px-1">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-amber-700/50 to-amber-900/30 sm:h-10 sm:w-10">
            {opponent?.memoji ? (
              <Image src={opponent.memoji} alt="Opponent" width={40} height={40} className="h-full w-full object-contain" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-white/70 uppercase sm:text-xs">
                {gameMode === 'computer' ? 'AI' : opponentDisplayName.slice(0, 2).toUpperCase() || '??'}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <p className="truncate text-xs font-semibold text-white sm:text-sm">
                {opponentDisplayName}
              </p>
              <PlayerRatingBadge rating={opponent?.rating} />
            </div>
            <p className="truncate text-[9px] text-white/30 sm:text-xs">
              {status === 'in-progress' && !isMyTurn
                ? 'Thinking...'
                : opponent
                  ? `Opponent · ${formatWalletAddress(opponent.address)}`
                  : ''}
            </p>
            {opponentMaterialDisplay ? (
              <MaterialBalanceStrip
                advantage={opponentMaterialDisplay.advantage}
                capturedPieces={opponentMaterialDisplay.capturedPieces}
              />
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {gameMode !== 'computer' && (
            <SignalStrength ping={opponentPing} isConnected={!!socket?.connected} variant="opponent" />
          )}
          {(() => {
            const opponentTime = playerColor === 'white' ? displayedTimes.blackTime : displayedTimes.whiteTime;
            const low = isLowTime(opponentTime, initialTime);
            return (
              <div className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 ${low ? 'bg-red-500 animate-pulse' : 'bg-white'}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={low ? "text-white/80" : "text-black/60"}>
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <span className={`text-xs font-mono tabular-nums font-semibold sm:text-sm ${low ? 'text-white' : 'text-black'}`}>
                  {formatTime(opponentTime)}
                </span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Opponent Disconnect Countdown Banner */}
      {disconnectCountdown !== null && disconnectCountdown > 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 px-4 py-2.5 animate-pulse">
          <div className="h-8 w-8 shrink-0 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <span className="text-xs font-bold text-yellow-400">{disconnectCountdown}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-yellow-300">
              Opponent disconnected
              <span className="ml-1 text-xs font-semibold text-yellow-400/80">
                {disconnectCountdown}s left
              </span>
            </p>
          </div>
        </div>
      )}

      {mobileMovePairs.length > 0 && (
        <div className="sm:hidden">
          <div className="overflow-x-auto px-1 pb-1 pt-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max items-center gap-1.5">
              {mobileMovePairs.map((pair, index) => (
                <div
                  key={pair.moveNumber}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition",
                    activeMobileMovePairIndex === index
                      ? "border-emerald-400/35 bg-emerald-400/16 text-emerald-100"
                      : "border-white/10 bg-white/5 text-white/55",
                  )}
                >
                  <span className="mr-1 font-mono text-white/40">{pair.moveNumber}.</span>
                  <span>{pair.white ?? "--"}</span>
                  {pair.black ? <span className="ml-1.5">{pair.black}</span> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

	      {/* Main Board Container */}
	        <div className="relative left-1/2 aspect-square w-screen max-w-none -translate-x-1/2 sm:left-auto sm:w-full sm:translate-x-0">
	        <div className="relative h-full w-full overflow-hidden rounded-none bg-[#1a1816] sm:rounded-xl">
	          {autoAbortCountdown !== null && autoAbortCountdown > 0 && status === "in-progress" && storeMoves.length === 0 && !isStakedMatch ? (
	            <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full border border-amber-400/20 bg-black/45 px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-amber-200 backdrop-blur-sm sm:top-3 sm:text-[11px]">
	              Auto abort in {autoAbortCountdown}s
	            </div>
	          ) : null}
	          <Chessboard
            key={`board-${boardKey}-${orientation}`}
            options={{
              id: chessboardId,
              position: displayFen,
              boardOrientation: orientation,
              showAnimations: boardAnimationsEnabled,
              animationDurationInMs: boardAnimationsEnabled ? MOVE_ANIMATION_DURATION_MS : 0,
              dragActivationDistance: isMobileViewport ? 8 : 1,
              allowDragOffBoard: false,
              allowDragging:
                status === 'in-progress' &&
                !!effectiveColor &&
                !isViewingHistory &&
                !promotionSelection,
              boardStyle: { borderRadius: isMobileViewport ? "0px" : "4px" },
              darkSquareStyle: boardTheme.darkSquareStyle,
              lightSquareStyle: boardTheme.lightSquareStyle,
              squareStyles: { ...lastMoveSquares, ...checkSquare, ...premoveSquares, ...moveSquares, ...checkFlash },
              pieces: boardPieces,
              onPieceDrag: () => {
                dragInteractionRef.current = true;
                dragStartedAtRef.current = Date.now();
              },
              onSquareMouseUp: () => {
                clearDragInteraction();
              },
              onSquareClick: onSquareClick,
              onPieceDrop: ({ sourceSquare, targetSquare }) => {
                if (!sourceSquare || !targetSquare) {
                  clearDragInteraction();
                  return false;
                }
                return onDrop(sourceSquare, targetSquare);
              },
            }}
          />

          {queuedPremove ? (
            <PremoveGhostOverlay
              from={queuedPremove.from}
              to={queuedPremove.to}
              orientation={orientation}
              pieceCode={queuedPremovePieceCode}
              useDefaultPieces={isMobileViewport && !useCustomPiecesOnMobile}
            />
          ) : null}

          {promotionSelection ? (
            <PromotionChooser
              targetSquare={promotionSelection.to}
              color={promotionSelection.color}
              orientation={orientation}
              onSelect={handlePromotionSelect}
              onCancel={cancelPromotionSelection}
            />
          ) : null}

          {status === "waiting" && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 animate-in fade-in duration-500">
              {/* <div className="text-center space-y-4">
                <div className="h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-white/60 font-medium">Initialize game options to start</p>
              </div> */}
            </div>
          )}

          {gameOver && !gameResultModalDismissed && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="w-full max-w-sm animate-in zoom-in-95 duration-300">
                <GlassBg className="p-5 sm:p-8 text-center relative" height="auto">
                  <button
                    onClick={() => setGameResultModalDismissed(true)}
                    className="absolute top-3 right-3 rounded-full p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <div className="flex flex-col items-center gap-4 sm:gap-6">
                    <div className="relative">
                      <div className={`h-16 w-16 sm:h-20 sm:w-20 rounded-full flex items-center justify-center border border-white/10 shadow-xl ${gameOver.winner === 'draw' ? 'bg-linear-to-br from-yellow-500/20 to-orange-500/20 shadow-yellow-500/10' : gameOver.winner === playerColor || gameOver.winner === 'opponent' ? 'bg-linear-to-br from-green-500/20 to-blue-500/20 shadow-green-500/10' : 'bg-linear-to-br from-red-500/20 to-orange-500/20 shadow-red-500/10'}`}>
                        {gameOver.winner === 'draw' ? (
                          <svg className="h-8 w-8 sm:h-10 sm:w-10 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        ) : gameOver.winner === playerColor || gameOver.winner === 'opponent' ? (
                          <WinnerCupIcon className="h-8 w-8 sm:h-10 sm:w-10" />
                        ) : (
                          <svg className="h-8 w-8 sm:h-10 sm:w-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 sm:space-y-2">
                      <h2 className="text-lg sm:text-xl font-bold text-white">
                        {gameOver.winner === 'draw' ? "DRAW" : (gameOver.winner === playerColor || gameOver.winner === 'opponent') ? "YOU WON!" : "GAME OVER"}
                      </h2>
                      <p className="text-xs sm:text-sm text-white/60 capitalize">
                        {formatGameReason(
                          displayedGameReason,
                          gameOver.winner === playerColor || gameOver.winner === "opponent",
                        )}
                      </p>
                    </div>

                    {ratingChange !== null && (
                      <div className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold border ${ratingChange > 0 ? 'bg-green-500/10 text-green-400 border-green-500/20' : ratingChange < 0 ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
                        {ratingCategoryLabel} rating: {ratingDisplayBase} {ratingChange > 0 ? `+${ratingChange}` : ratingChange === 0 ? '+0' : ratingChange} → {ratingDisplayFinal}
                      </div>
                    )}

                    {/* Claim Prize button for staked games */}
                    {onChainGameId !== null && (gameOver.winner === playerColor || gameOver.winner === 'opponent' || gameOver.winner === 'draw') && (
                      settlementFailed ? (
                        <div className="w-full rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-center">
                          <p className="text-sm font-semibold text-red-400">Settlement failed</p>
                          <p className="text-xs text-red-400/70 mt-1">
                            Prize cannot be claimed right now. The server was unable to settle the game on-chain. Your funds are safe — please contact support to resolve this.
                          </p>
                        </div>
                      ) : (
                        <button
                          onClick={async () => {
                            if (prizeClaimed || isClaimLoading) return;
                            await claimPrizeSingle(BigInt(onChainGameId.toString()));
                            setPrizeClaimed(true);
                          }}
                          disabled={prizeClaimed || isClaimLoading}
                          className={`w-full relative group overflow-hidden rounded-full py-2.5 sm:py-3 transition-transform active:scale-95 ${prizeClaimed ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <div className={`absolute inset-0 ${prizeClaimed ? 'bg-gray-600' : 'bg-linear-to-r from-amber-500 to-yellow-500 opacity-90 group-hover:opacity-100'} transition-opacity`} />
                          <span className="relative text-sm font-bold text-white flex items-center justify-center gap-2">
                            {isClaimLoading && (
                              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            )}
                            {prizeClaimed ? 'Prize Claimed' : isClaimLoading ? 'Claiming...' : 'Claim Prize'}
                          </span>
                        </button>
                      )
                    )}

                    {canRequestRematch ? (
                      <button
                        onClick={handleRequestRematch}
                        disabled={rematchRequestPending}
                        className={`w-full relative group overflow-hidden rounded-full py-2.5 sm:py-3 transition-transform active:scale-95 ${rematchRequestPending ? "opacity-70 cursor-not-allowed" : ""}`}
                      >
                        <div className="absolute inset-0 bg-linear-to-r from-emerald-600 to-blue-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                        <span className="relative text-sm font-bold text-white">
                          {rematchRequestPending ? "Rematch Requested" : "Rematch"}
                        </span>
                      </button>
                    ) : null}

                    <button
                      onClick={handlePostGamePlayAgain}
                      className="w-full relative group overflow-hidden rounded-full py-2.5 sm:py-3 transition-transform active:scale-95 mt-1 sm:mt-2"
                    >
                      <div className="absolute inset-0 bg-linear-to-r from-blue-600 to-purple-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                      <span className="relative text-sm font-bold text-white">
                        New Game
                      </span>
                    </button>
                  </div>
                </GlassBg>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Info (Player) */}
      <div className="flex items-center justify-between px-0.5 sm:px-1">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10 sm:h-10 sm:w-10">
            {player?.memoji ? (
              <Image src={player.memoji} alt="You" width={40} height={40} className="h-full w-full object-contain" />
            ) : (
              <span className="text-[10px] font-bold text-white/50 sm:text-xs">YOU</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <p className="truncate text-xs font-semibold text-white sm:text-sm">{playerDisplayName}</p>
              <PlayerRatingBadge rating={player?.rating} />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-[9px] text-white/30 sm:text-xs">
                <p>
                  {status === 'in-progress' && isMyTurn
                    ? 'Your move'
                    : status === 'in-progress' && queuedPremove
                      ? 'Premove set'
                      : 'Online'}
                </p>
              </div>
              {playerNetworkStatus ? (
                <p className="text-[9px] font-medium text-amber-300 sm:text-[11px]">
                  {playerNetworkStatus}
                </p>
              ) : null}
            </div>
            {playerMaterialDisplay ? (
              <MaterialBalanceStrip
                advantage={playerMaterialDisplay.advantage}
                capturedPieces={playerMaterialDisplay.capturedPieces}
              />
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {gameMode !== 'computer' && (
            <SignalStrength ping={ping} isConnected={!!socket?.connected} />
          )}
          {(() => {
            const myTime = playerColor === 'white' ? displayedTimes.whiteTime : displayedTimes.blackTime;
            const low = isLowTime(myTime, initialTime);
            return (
              <div className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 ${low ? 'bg-red-500 animate-pulse' : 'bg-white'}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={low ? "text-white/80" : "text-black/60"}>
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <span className={`text-xs font-mono tabular-nums font-semibold sm:text-sm ${low ? 'text-white' : 'text-black'}`}>
                  {formatTime(myTime)}
                </span>
              </div>
            );
          })()}
        </div>
      </div>
     </div>

      {/* Draw / End Game Controls */}
      {status === 'in-progress' && ((!isMobileViewport && ['online', 'friend'].includes(gameMode || '')) || gameMode === 'computer') && (
        <div className="flex items-center gap-4 px-0.5 pt-0.5 sm:gap-6 sm:px-1 sm:pt-1">
          {!isMobileViewport && ['online', 'friend'].includes(gameMode || '') && (
            <button
              onClick={() => {
                if (!socket || !roomId) return;
                if (drawOfferSent) {
                  socket.emit("cancelDraw", { roomId });
                  setDrawOfferSent(false);
                } else {
                  socket.emit("offerDraw", { roomId });
                  setDrawOfferSent(true);
                }
              }}
              className="flex items-center gap-1.5 text-sm font-medium text-green-400 hover:text-cyan-300 transition-colors"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 12h8" /><circle cx="12" cy="12" r="10" />
              </svg>
              {drawOfferSent ? "Cancel Draw" : "Draw"}
            </button>
          )}
          {!isMobileViewport && ['online', 'friend'].includes(gameMode || '') && (
            <button
              onClick={() => setShowResignModal(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-red-400 hover:text-red-300 transition-colors"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              Resign
            </button>
          )}
          {gameMode === 'computer' && (
            <button
              onClick={() => {
                if (confirm("Reset current board? (Local only)")) {
                  game.reset();
                  syncState();
                }
              }}
              className="flex items-center gap-1.5 text-sm font-medium text-white/40 hover:text-white/60 transition-colors"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              Reset
            </button>
          )}
        </div>
      )}


      {/* Resign Confirmation Modal */}
      <ResignConfirmModal
        isOpen={showResignModal}
        onConfirm={handleResign}
        onCancel={() => setShowResignModal(false)}
      />

      {/* Draw Offer Modal (shown when opponent offers a draw) */}
      <DrawOfferModal
        isOpen={drawOfferReceived}
        onAccept={handleAcceptDraw}
        onDecline={handleDeclineDraw}
      />
    </div>
  );
}
