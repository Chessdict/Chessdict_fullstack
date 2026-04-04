"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Chess } from "chess.js";
import { Chessboard, defaultPieces } from "react-chessboard";
import { customPieces } from "@/components/chess/custom-pieces";
import { getAutomaticDrawReason } from "@/lib/game-result-display";
import { PromotionChooser } from "@/components/chess/promotion-chooser";
import { PremoveGhostOverlay } from "@/components/chess/premove-ghost-overlay";
import { MaterialBalanceStrip } from "@/components/chess/material-balance-strip";
import { PlayerRatingBadge } from "@/components/chess/player-rating-badge";
import { useTournamentStore } from "@/stores/tournament-store";
import {
  getPromotionSelection,
  type PromotionPiece,
  type PromotionSelection,
} from "@/lib/chess-promotion";
import { getMaterialBalance, getSideMaterialDisplay } from "@/lib/material-balance";
import { canSetPremove, getPremoveTargets, type Premove } from "@/lib/premove";
import { useBoardTheme } from "@/hooks/useBoardTheme";
import { useBoardPieces } from "@/hooks/useBoardPieces";
import { type Socket } from "socket.io-client";
import { SignalStrength } from "@/components/game/signal-strength";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface TournamentGameBoardProps {
  socket: Socket | null;
  myAddress: string;
}

type SelectionMode = "move" | "premove" | null;
const MOVE_ANIMATION_DURATION_MS = 120;

function isPromotionDestination(square: string, color: "w" | "b") {
  const rank = square[1];
  return (color === "w" && rank === "8") || (color === "b" && rank === "1");
}

export function TournamentGameBoard({
  socket,
  myAddress,
}: TournamentGameBoardProps) {
  const { boardTheme } = useBoardTheme();
  const { useCustomPiecesOnMobile } = useBoardPieces();
  const {
    tournamentId,
    gameId,
    playerColor,
    opponentAddress,
    playerRating,
    opponentRating,
    timeControl,
    whiteTime,
    blackTime,
    decrementWhiteTime,
    decrementBlackTime,
    setGameResult,
    setPhase,
    gameResult,
    disconnectedPlayers,
  } = useTournamentStore();

  const game = useMemo(() => new Chess(), []);
  const [fen, setFen] = useState(game.fen());
  const playerTurnCode = playerColor ? (playerColor === "black" ? "b" : "w") : null;
  const chessboardId = useMemo(() => `tournament-board-${gameId ?? "active"}`, [gameId]);
  const [moveSquares, setMoveSquares] = useState<
    Record<string, React.CSSProperties>
  >({});
  const [sourceSquare, setSourceSquare] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const [queuedPremove, setQueuedPremove] = useState<Premove | null>(null);
  const [skipNextAnimation, setSkipNextAnimation] = useState(false);
  const [promotionSelection, setPromotionSelection] = useState<PromotionSelection | null>(null);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const sourceSquareRef = useRef<string | null>(null);
  const selectionModeRef = useRef<SelectionMode>(null);
  const queuedPremoveRef = useRef<Premove | null>(null);
  const revalidateSelectionRef = useRef<(() => void) | null>(null);
  const dragInteractionRef = useRef(false);
  const dragStartedAtRef = useRef(0);
  const [boardKey, setBoardKey] = useState(0);

  const resetBoardInteraction = useCallback(() => {
    setBoardKey((previous) => previous + 1);
  }, []);

  const clearDragInteraction = useCallback(() => {
    dragInteractionRef.current = false;
    dragStartedAtRef.current = 0;
  }, []);

  const hasBrokenDragInteraction = useCallback(() => {
    if (!dragInteractionRef.current) return false;

    // Tournament board follows the same rule as the main board:
    // recover only if a drag is still active after the normal pointer lifecycle.
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
    const updateViewport = () => {
      setIsMobileViewport(window.innerWidth < 640);
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

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

  useEffect(() => {
    queuedPremoveRef.current = queuedPremove;
  }, [queuedPremove]);

  useEffect(() => {
    if (skipNextAnimation) {
      setSkipNextAnimation(false);
    }
  }, [fen, skipNextAnimation]);

  // Reset game when gameId changes
  useEffect(() => {
    game.reset();
    setFen(game.fen());
    clearSelection();
    setQueuedPremove(null);
    setPromotionSelection(null);
    setShowResignConfirm(false);
    clearDragInteraction();
    resetBoardInteraction();
  }, [gameId, game, clearSelection, resetBoardInteraction, clearDragInteraction]);

  useEffect(() => {
    if (gameResult) {
      clearSelection();
      setQueuedPremove(null);
      setPromotionSelection(null);
      clearDragInteraction();
      resetBoardInteraction();
    }
  }, [gameResult, clearSelection, resetBoardInteraction, clearDragInteraction]);

  const safeMove = useCallback(
    (move: any, options?: { preserveSelection?: boolean; resetBoardInteraction?: boolean }) => {
      try {
        const result = game.move(move);
        if (result) {
          syncState();
          if (options?.preserveSelection) {
            revalidateSelectionRef.current?.();
          } else {
            clearSelection();
          }
          if (options?.resetBoardInteraction && hasBrokenDragInteraction()) {
            resetBoardInteraction();
          }
          clearDragInteraction();
          return result;
        }
      } catch {
        // invalid move
      }
      return null;
    },
    [clearSelection, game, resetBoardInteraction, syncState, clearDragInteraction, hasBrokenDragInteraction],
  );

  const playPlayerMove = useCallback((move: Premove) => {
    const result = safeMove(move);
    if (!result) return null;

    if (socket && gameId) {
      socket.emit("tournament:move", { gameId, move });
    }

    return result;
  }, [gameId, safeMove, socket]);

  const flushQueuedPremove = useCallback(() => {
    const pendingMove = queuedPremoveRef.current;
    if (!pendingMove || gameResult || game.isGameOver() || !playerTurnCode) return false;
    if (game.turn() !== playerTurnCode) return false;

    queuedPremoveRef.current = null;
    setQueuedPremove(null);
    setSkipNextAnimation(true);
    return !!playPlayerMove(pendingMove);
  }, [game, gameResult, playPlayerMove, playerTurnCode]);

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
  const boardPieces = isMobileViewport && !useCustomPiecesOnMobile ? defaultPieces : customPieces;
  const boardAnimationsEnabled = true;

  // Timer countdown
  useEffect(() => {
    if (gameResult) return;
    if (!gameId) return;

    const turn = game.turn();
    const interval = setInterval(() => {
      if (turn === "w") decrementWhiteTime();
      else decrementBlackTime();
    }, 1000);

    return () => clearInterval(interval);
  }, [gameResult, gameId, fen, game, decrementWhiteTime, decrementBlackTime]);

  // Handle timeout
  useEffect(() => {
    if (gameResult) return;
    if (!gameId) return;

    const turn = game.turn();
    const timeLeft = turn === "w" ? whiteTime : blackTime;

    if (timeLeft <= 0) {
      const winner = turn === "w" ? "black" : "white";
      setGameResult(winner, "timeout");
      setPhase("round-waiting");

      if (socket && tournamentId && gameId) {
        socket.emit("tournament:gameComplete", {
          tournamentId,
          gameId,
          winner,
          isDraw: false,
        });
      }
    }
  }, [
    whiteTime,
    blackTime,
    gameResult,
    gameId,
    game,
    socket,
    tournamentId,
    setGameResult,
    setPhase,
  ]);

  // Listen for opponent moves
  useEffect(() => {
    if (!socket || !gameId) return;

    const handleOpponentMove = ({
      move,
    }: {
      gameId: string;
      move: any;
    }) => {
      safeMove(move, { preserveSelection: true, resetBoardInteraction: true });
      flushQueuedPremove();
    };

    socket.on("tournament:opponentMove", handleOpponentMove);
    return () => {
      socket.off("tournament:opponentMove", handleOpponentMove);
    };
  }, [socket, gameId, safeMove, flushQueuedPremove]);

  useEffect(() => {
    flushQueuedPremove();
  }, [fen, flushQueuedPremove]);

  // Listen for force end
  useEffect(() => {
    if (!socket || !gameId) return;

    const handleForceEnd = () => {
      setGameResult("draw", "round_timeout");
      setPhase("round-waiting");
    };

    socket.on("tournament:forceEnd", handleForceEnd);
    return () => {
      socket.off("tournament:forceEnd", handleForceEnd);
    };
  }, [socket, gameId, setGameResult, setPhase]);

  // Check for checkmate/stalemate/draw
  useEffect(() => {
    if (gameResult) return;
    if (!game.isGameOver()) return;

    let winner: "white" | "black" | "draw" = "draw";
    let reason = "draw";

    if (game.isCheckmate()) {
      const loser = game.turn();
      winner = loser === "w" ? "black" : "white";
      reason = "checkmate";
    } else {
      reason = getAutomaticDrawReason(game) ?? "draw";
    }

    setGameResult(winner, reason);
    setPhase("round-waiting");

    if (socket && tournamentId && gameId) {
      socket.emit("tournament:gameComplete", {
        tournamentId,
        gameId,
        winner,
        isDraw: winner === "draw",
      });
    }
  }, [
    fen,
    gameResult,
    game,
    socket,
    tournamentId,
    gameId,
    setGameResult,
    setPhase,
  ]);

  // Move options highlighting
  const getMoveOptions = useCallback((square: string) => {
    if (!playerTurnCode) return false;

    const turn = game.turn();
    const piece = game.get(square as any);
    if (!piece || piece.color !== turn || piece.color !== playerTurnCode) return false;

    const moves = game.moves({ square: square as any, verbose: true });
    if (moves.length === 0) {
      setMoveSquares({});
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
    newSquares[square] = { background: "rgba(255, 255, 0, 0.4)" };
    setMoveSquares(newSquares);
    return true;
  }, [game, playerTurnCode]);

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
    newSquares[square] = { background: "rgba(59, 130, 246, 0.24)" };
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

  const onSquareClick = ({ square }: { square: string }) => {
    if (gameResult || !playerTurnCode || promotionSelection) return;

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

  const onDrop = useCallback(
    (source: string, target: string) => {
      if (gameResult || promotionSelection) {
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
    },
    [clearQueuedPremove, clearDragInteraction, game, gameResult, playPlayerMove, playerTurnCode, promotionSelection, queuedPremove, requestPromotion, tryQueuePremove],
  );

  const handleResign = () => {
    if (!socket || !tournamentId || !gameId) return;
    socket.emit("tournament:resign", { tournamentId, gameId });
    const winner = playerColor === "white" ? "black" : "white";
    setGameResult(winner, "resignation");
    setPhase("round-waiting");
    setShowResignConfirm(false);
  };

  const orientation: "white" | "black" =
    playerColor === "black" ? "black" : "white";
  const currentTurn = game.turn();
  const isMyTurn = !!playerTurnCode && currentTurn === playerTurnCode;
  const materialBalance = useMemo(() => getMaterialBalance(fen), [fen]);
  const playerMaterialDisplay = useMemo(() => {
    if (!playerColor) return null;

    return getSideMaterialDisplay(materialBalance, playerColor);
  }, [materialBalance, playerColor]);
  const opponentMaterialDisplay = useMemo(() => {
    if (!playerColor) return null;

    return getSideMaterialDisplay(
      materialBalance,
      playerColor === "white" ? "black" : "white",
    );
  }, [materialBalance, playerColor]);

  // Opponent disconnect countdown
  const opponentDeadline = opponentAddress
    ? disconnectedPlayers[opponentAddress.toLowerCase()] ?? null
    : null;
  const [opponentCountdown, setOpponentCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!opponentDeadline) {
      setOpponentCountdown(null);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((opponentDeadline - Date.now()) / 1000));
      setOpponentCountdown(remaining);
    };
    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [opponentDeadline]);

  return (
    <div className="mx-auto flex w-full max-w-[clamp(480px,calc(100vh-7rem),1300px)] flex-col gap-2 sm:gap-4">
     <div className="flex flex-col gap-2 sm:gap-3 rounded-2xl bg-[#1A1A1A]/80 border border-white/5 px-4 py-3 sm:px-5 sm:py-4">
      {/* Opponent timer + info */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-full bg-gradient-to-br from-red-500/20 to-transparent border border-white/10 ring-2 ring-red-500/20">
            <div className="h-full w-full flex items-center justify-center text-xs font-bold text-white/40 uppercase">
              {opponentAddress?.slice(2, 4) || "??"}
            </div>
          </div>
          <div>
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-sm font-bold tracking-tight text-white">
                {opponentAddress
                  ? `${opponentAddress.slice(0, 6)}...${opponentAddress.slice(-4)}`
                  : "Waiting..."}
              </div>
              <PlayerRatingBadge rating={opponentRating} />
            </div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-white/30">
              {!isMyTurn && !gameResult ? "Thinking..." : "Waiting"}
            </div>
            {opponentMaterialDisplay ? (
              <MaterialBalanceStrip
                advantage={opponentMaterialDisplay.advantage}
                capturedPieces={opponentMaterialDisplay.capturedPieces}
              />
            ) : null}
          </div>
        </div>
        <div
          className={`text-xl font-mono tabular-nums px-3 py-1 rounded-lg border ${
            !isMyTurn && !gameResult
              ? "bg-red-500/20 border-red-500/30 text-red-400"
              : "bg-black/40 border-white/10 text-white/90"
          } ${(playerColor === "white" ? blackTime : whiteTime) <= 30 ? "animate-pulse" : ""}`}
        >
          {formatTime(playerColor === "white" ? blackTime : whiteTime)}
        </div>
      </div>

      {/* Opponent disconnected banner */}
      {opponentCountdown !== null && opponentCountdown > 0 && !gameResult && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 animate-pulse">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/30">
            <svg className="h-4 w-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-300">Opponent disconnected</p>
            <p className="text-xs text-amber-400/60">
              Forfeit in{" "}
              <span className="font-mono font-bold text-amber-400 tabular-nums">
                {opponentCountdown}s
              </span>
              {" "}if they don&apos;t reconnect
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/40">
            <span className="text-lg font-bold font-mono tabular-nums text-amber-400">
              {opponentCountdown}
            </span>
          </div>
        </div>
      )}

      {/* Chess Board */}
      <div className="relative w-full aspect-square">
        <div className="relative h-full w-full overflow-hidden rounded-xl bg-[#1a1816]">
          <Chessboard
            key={`tboard-${gameId}-${orientation}-${boardKey}`}
            options={{
              id: chessboardId,
              position: fen,
              boardOrientation: orientation,
              showAnimations: boardAnimationsEnabled,
              animationDurationInMs:
                boardAnimationsEnabled ? (skipNextAnimation ? 0 : MOVE_ANIMATION_DURATION_MS) : 0,
              allowDragOffBoard: false,
              allowDragging: !gameResult && !promotionSelection,
              boardStyle: { borderRadius: "4px" },
              darkSquareStyle: boardTheme.darkSquareStyle,
              lightSquareStyle: boardTheme.lightSquareStyle,
              squareStyles: { ...premoveSquares, ...moveSquares },
              pieces: boardPieces,
              onPieceDrag: () => {
                dragInteractionRef.current = true;
                dragStartedAtRef.current = Date.now();
              },
              onSquareMouseUp: () => {
                clearDragInteraction();
              },
              onSquareClick: onSquareClick,
              onPieceDrop: ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
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
        </div>
      </div>

      {/* Player timer + info */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-full bg-gradient-to-br from-blue-500/20 to-transparent border border-blue-500/30 ring-2 ring-blue-500/20">
            <div className="h-full w-full flex items-center justify-center text-xs font-bold text-blue-400">
              YOU
            </div>
          </div>
          <div>
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-sm font-bold tracking-tight text-white">
                {myAddress
                  ? `${myAddress.slice(0, 6)}...${myAddress.slice(-4)}`
                  : "You"}
              </div>
              <PlayerRatingBadge rating={playerRating} />
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-400/60">
              <span>
                {isMyTurn && !gameResult ? "Your turn" : queuedPremove && !gameResult ? "Premove set" : "Waiting"}
              </span>
            </div>
            {playerMaterialDisplay ? (
              <MaterialBalanceStrip
                advantage={playerMaterialDisplay.advantage}
                capturedPieces={playerMaterialDisplay.capturedPieces}
              />
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <SignalStrength socket={socket} isConnected={!!socket?.connected} />
        <div
          className={`text-xl font-mono tabular-nums px-3 py-1 rounded-lg border ${
            isMyTurn && !gameResult
              ? "bg-blue-500/20 border-blue-500/30 text-blue-400"
              : "bg-black/40 border-white/10 text-white/90"
          } ${(playerColor === "white" ? whiteTime : blackTime) <= 30 ? "animate-pulse" : ""}`}
        >
          {formatTime(playerColor === "white" ? whiteTime : blackTime)}
        </div>
        </div>
      </div>

     </div>

      {/* Resign button */}
      {!gameResult && (
        <div className="flex justify-center">
          {!showResignConfirm ? (
            <button
              onClick={() => setShowResignConfirm(true)}
              className="flex items-center gap-2 rounded-xl bg-red-500/10 px-6 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/20"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
                />
              </svg>
              Resign
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/60">Resign this game?</span>
              <button
                onClick={handleResign}
                className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/30"
              >
                Yes
              </button>
              <button
                onClick={() => setShowResignConfirm(false)}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white/60 transition hover:bg-white/20"
              >
                No
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
