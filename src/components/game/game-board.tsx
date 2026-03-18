"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Chess, Move } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useGameStore } from "@/stores/game-store";
import { getBestMove } from "@/lib/chess-ai";
import { useSocket } from "@/hooks/useSocket";
import { useAccount } from "wagmi";
import { useChessdict } from "@/hooks/useChessdict";
import { ResignConfirmModal } from "./resign-confirm-modal";
import { DrawOfferModal } from "./draw-offer-modal";
import { GlassBg } from "../glass-bg";
import { useChessSounds } from "@/hooks/useChessSounds";
import { SignalStrength } from "./signal-strength";
import { getMemojiForAddress } from "@/lib/memoji";
import Image from "next/image";


// Helper to format time as MM:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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

export function GameBoard() {
  const {
    gameMode,
    status,
    difficulty,
    roomId,
    playerColor,
    player,
    opponent,
    setStatus,
    addMove,
    clearMoves,
    setOpponentConnected,
    // Timer state
    whiteTime,
    blackTime,
    setWhiteTime,
    setBlackTime,
    decrementWhiteTime,
    decrementBlackTime,
    resetTimers,
    gameOver,
    setGameOver,
    drawOfferReceived,
    drawOfferSent,
    setDrawOfferReceived,
    setDrawOfferSent,
    // Rejoin state
    rejoinFen,
    rejoinMoves,
    clearRejoinData,
    // Opponent disconnect
    opponentDisconnectDeadline,
    setOpponentDisconnectDeadline,
    // On-chain state
    onChainGameId,
    reset: resetStore
  } = useGameStore();

  const [ping, setPing] = useState<number>(0);
  const [opponentPing, setOpponentPing] = useState<number>(0);
  const [showResignModal, setShowResignModal] = useState(false);
  const [ratingChange, setRatingChange] = useState<number | null>(null);
  const [checkFlash, setCheckFlash] = useState<Record<string, React.CSSProperties>>({});
  const [disconnectCountdown, setDisconnectCountdown] = useState<number | null>(null);
  const [prizeClaimed, setPrizeClaimed] = useState(false);

  const { address } = useAccount();
  const { socket } = useSocket(address ?? undefined);
  const { playMoveSound, playGameOver } = useChessSounds();
  const { claimPrizeSingle, isLoading: isClaimLoading } = useChessdict();


  // Initialize the chess instance once and keep it stable.
  // We use fen as the source of truth for React rendering.
  const game = useMemo(() => new Chess(), []);
  const [fen, setFen] = useState(game.fen());

  // Diagnostic state to show in UI
  const [lastMove, setLastMove] = useState<Move | null>(null);

  // State for move highlighting
  const [moveSquares, setMoveSquares] = useState<Record<string, React.CSSProperties>>({});
  const [sourceSquare, setSourceSquare] = useState<string | null>(null);
  // State for last move highlighting (persists between moves)
  const [lastMoveSquares, setLastMoveSquares] = useState<Record<string, React.CSSProperties>>({});

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

  const safeMove = useCallback((move: any) => {
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

        // Clear selection highlights after move
        setMoveSquares({});
        setSourceSquare(null);

        // Play sound based on move type
        playMoveSound(result);

        return result;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }, [game, syncState, addMove, playMoveSound]);

  // Handle Game Initialization / Resets
  useEffect(() => {
    if (status === "waiting") {
      game.reset();
      syncState();
      setLastMove(null);
      clearMoves();
      resetTimers();
      setMoveSquares({});
      setSourceSquare(null);
      setLastMoveSquares({});
    }
  }, [status, game, syncState, clearMoves, resetTimers]);

  // Load rejoined game state (after browser refresh reconnection)
  useEffect(() => {
    if (status === "in-progress" && rejoinFen) {
      try {
        game.load(rejoinFen);
        syncState();
        clearMoves();
        rejoinMoves.forEach(m => addMove(m));
        clearRejoinData();
        console.log("[CLIENT] Rejoined game state loaded, FEN:", rejoinFen);
      } catch (e) {
        console.error("[CLIENT] Failed to load rejoin FEN:", e);
        clearRejoinData();
      }
    }
  }, [status, rejoinFen, rejoinMoves, game, syncState, clearMoves, addMove, clearRejoinData]);

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

  // Timer countdown logic
  useEffect(() => {
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
  }, [status, gameOver, game, fen, decrementWhiteTime, decrementBlackTime]);

  // Handle timeout (time runs out) - only for local/computer games
  // For multiplayer, the server handles timeouts authoritatively
  useEffect(() => {
    if (status !== "in-progress") return;
    if (gameOver) return;

    const isMultiplayer = gameMode === 'online' || gameMode === 'friend';
    if (isMultiplayer) return; // Server handles timeout for multiplayer

    const currentTurnForTimer = game.turn();
    const timeoutPlayer = currentTurnForTimer === 'w' ? whiteTime : blackTime;

    if (timeoutPlayer <= 0) {
      const winner = currentTurnForTimer === 'w' ? 'black' : 'white';
      console.log(`[CLIENT] Timeout! ${winner} wins`);
      setGameOver(winner, "timeout");
      setStatus("finished");
    }
  }, [whiteTime, blackTime, status, gameOver, game, gameMode, setGameOver, setStatus]);

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
          safeMove(move);
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

  // Join room when entering multiplayer game
  useEffect(() => {
    const isMultiplayer = gameMode === 'online' || gameMode === 'friend';
    if (!socket || !isMultiplayer || !roomId) return;

    // Explicitly join the room to ensure we receive opponent moves
    // This handles cases where socket reconnects or component remounts
    const joinRoom = () => {
      socket.emit("joinRoom", { roomId });
    };

    // Join immediately
    joinRoom();

    // Rejoin on reconnection
    socket.on("connect", joinRoom);

    return () => {
      socket.off("connect", joinRoom);
    };
  }, [socket, gameMode, roomId]);

  // Network Logic - Listen for opponent moves
  useEffect(() => {
    const isMultiplayer = gameMode === 'online' || gameMode === 'friend';
    if (!socket || !isMultiplayer || !roomId) return;

    const handleOpponentMove = (move: any) => {
      safeMove(move);
    };

    socket.on('opponentMove', handleOpponentMove);
    return () => { socket.off('opponentMove', handleOpponentMove); };
  }, [socket, gameMode, roomId, safeMove]);

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

    const handleGameOver = ({ winner, reason, ratings }: { winner: "white" | "black" | "draw" | "opponent"; reason: any; ratings?: Record<string, number> }) => {
      console.log("[CLIENT] gameOver event received:", { winner, reason, ratings });
      setGameOver(winner, reason);
      setStatus("finished");
      playGameOver();
      if (ratings && address) {
        const newRating = ratings[address];
        const oldRating = player?.rating;
        if (newRating !== undefined && oldRating !== undefined) {
          setRatingChange(newRating - oldRating);
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

    const handleTimeSync = (data: { whiteTime: number; blackTime: number }) => {
      setWhiteTime(data.whiteTime);
      setBlackTime(data.blackTime);
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
    socket.on('opponentDisconnecting', handleOpponentDisconnecting);
    socket.on('opponentReconnected', handleOpponentReconnected);

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
      socket.off('opponentDisconnecting', handleOpponentDisconnecting);
      socket.off('opponentReconnected', handleOpponentReconnected);
    };
  }, [socket, gameMode, roomId, opponent, setOpponentConnected, setGameOver, setStatus, setDrawOfferReceived, setDrawOfferSent, playGameOver, address, player?.rating, setWhiteTime, setBlackTime, setOpponentDisconnectDeadline]);

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
  const getMoveOptions = (square: string) => {
    // Only allow selecting if it's the player's turn and color
    const turn = game.turn();
    const piece = game.get(square as any);

    // Check if it's our piece
    const isMultiplayer = gameMode === 'online' || gameMode === 'friend';
    const myColor = playerColor || (gameMode === 'computer' ? 'white' : undefined);

    // In multiplayer, must be assigned color. In computer, default is white.
    // Also must be turn of the piece (white/black)
    if (!piece || piece.color !== turn) {
      return false;
    }

    // Must be our color in multiplayer or computer mode
    const myTurnCode = myColor === 'black' ? 'b' : 'w';
    if (piece.color !== myTurnCode) {
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
    const sourcePiece = game.get(square as any); // Capture piece for stable color comparison
    const sourceColor = sourcePiece?.color;

    moves.map((move: any) => {
      const targetPiece = game.get(move.to);
      newSquares[move.to] = {
        background:
          targetPiece && targetPiece.color !== sourceColor
            ? "radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)"
            : "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
        borderRadius: "50%",
      };
      return move;
    });

    // Also highlight the source square
    newSquares[square] = {
      background: "rgba(255, 255, 0, 0.4)",
    };

    setMoveSquares(newSquares);
    return true;
  }

  // Handle square clicks for click-to-move and highlighting
  const onSquareClick = ({ square }: { square: string }) => {
    if (status !== "in-progress") return;

    // If we already have a selected piece
    if (sourceSquare) {
      // If clicking the same square, deselect
      if (sourceSquare === square) {
        setSourceSquare(null);
        setMoveSquares({});
        return;
      }

      // Attempt to move
      const moveData = {
        from: sourceSquare,
        to: square,
        promotion: "q", // always promote to queen for simplicity
      };

      try {
        const move = game.move(moveData); // Validates and executes if valid

        if (move) {
          // Move was valid (game.move modifies state locally)
          // Undo local move to use safeMove which handles sync and side effects logic
          game.undo();

          const result = safeMove(moveData); // Use our wrapper

          if (result && (gameMode === 'online' || gameMode === 'friend') && roomId) {
            socket?.emit("movePiece", {
              roomId,
              move: moveData,
              fen: game.fen(),
              moveRecord: { san: result.san, from: result.from, to: result.to, color: result.color, piece: result.piece, timestamp: Date.now() },
            });
          }
          return;
        }
      } catch (e) {
        // move failed, fall through to piece selection logic
      }

      // If move was invalid (or threw), check if we clicked on another one of our pieces
      const piece = game.get(square as any);
      const isMultiplayer = gameMode === 'online' || gameMode === 'friend';
      const myColor = playerColor || (gameMode === 'computer' ? 'white' : undefined);
      const myTurnCode = myColor === 'black' ? 'b' : 'w';

      if (piece && piece.color === myTurnCode) {
        // Switch selection
        setSourceSquare(square);
        getMoveOptions(square);
        return;
      }

      // Invalid move and not clicking our own piece -> Deselect
      flashKingCheck();
      setSourceSquare(null);
      setMoveSquares({});
      return;
    }

    // No piece selected yet, try to select
    if (getMoveOptions(square)) {
      setSourceSquare(square);
    } else {
      setSourceSquare(null);
      setMoveSquares({});
    }
  };

  // Primary Move Handler for Chessboard (Drag and Drop)
  const onDrop = useCallback((source: string, target: string) => {
    if (status !== "in-progress") return false;
    if (game.isGameOver()) return false;

    // For multiplayer, playerColor must be set
    const isMultiplayer = gameMode === 'online' || gameMode === 'friend';
    const myColor = playerColor || (gameMode === 'computer' ? 'white' : undefined);

    if (isMultiplayer && !myColor) {
      console.warn("ACTION: Player color not assigned yet in multiplayer");
      return false;
    }

    const turn = game.turn();
    const myTurnCode = myColor === 'black' ? 'b' : 'w';

    if (turn !== myTurnCode) {
      return false;
    }

    const moveData = { from: source, to: target, promotion: "q" };
    const result = safeMove(moveData);

    if (result) {
      if (isMultiplayer && roomId) {
        socket?.emit("movePiece", {
          roomId,
          move: moveData,
          fen: game.fen(),
          moveRecord: { san: result.san, from: result.from, to: result.to, color: result.color, piece: result.piece, timestamp: Date.now() },
        });
      }
      return true;
    }

    return false;
  }, [game, status, playerColor, gameMode, roomId, socket, safeMove]);

  // UI Helpers
  // For multiplayer: use the assigned color. For computer: default to white if not set.
  const effectiveColor = playerColor || (gameMode === 'computer' ? 'white' : undefined);
  // Board orientation: "black" means black pieces at bottom, "white" means white pieces at bottom
  const orientation: "white" | "black" = effectiveColor === "black" ? "black" : "white";

  // Force remount counter when color changes
  const [boardKey, setBoardKey] = useState(0);
  useEffect(() => {
    if (playerColor) {
      setBoardKey(prev => prev + 1);
    }
  }, [playerColor]);

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
  const playerTurnCode = effectiveColor === 'black' ? 'b' : 'w';
  const isMyTurn = currentTurn === playerTurnCode;

  return (
    <div className="flex flex-col gap-2 sm:gap-4 w-full">
      {/* Top Info (Opponent) */}
      <div className="flex items-center justify-between rounded-2xl bg-[#1A1A1A]/80 px-4 py-3 border border-white/5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-amber-700/50 to-amber-900/30 border border-white/10 flex items-center justify-center overflow-hidden">
            {opponent?.memoji ? (
              <Image src={opponent.memoji} alt="Opponent" width={40} height={40} className="h-full w-full object-contain" />
            ) : (
              <span className="text-xs font-bold text-white/70 uppercase">
                {gameMode === 'computer' ? 'AI' : opponent?.address.slice(2, 4) || '??'}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {gameMode === 'computer' ? 'Stockfish' : opponent ? (opponent.address.slice(0, 6) + '...' + opponent.address.slice(-4)) : 'Waiting...'}
            </p>
            <p className="text-xs text-white/30 truncate">
              {opponent ? opponent.address.slice(0, 4) + '...' + opponent.address.slice(-4) : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {gameMode !== 'computer' && (
            <SignalStrength ping={opponentPing} isConnected={!!socket?.connected} variant="opponent" />
          )}
          <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1 bg-white ${(playerColor === 'white' ? blackTime : whiteTime) <= 30 ? 'animate-pulse' : ''}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-black/60">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-sm font-mono tabular-nums font-semibold text-black">
              {formatTime(playerColor === 'white' ? blackTime : whiteTime)}
            </span>
          </div>
        </div>
      </div>

      {/* Opponent Disconnect Countdown Banner */}
      {disconnectCountdown !== null && disconnectCountdown > 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 px-4 py-2.5 animate-pulse">
          <div className="h-8 w-8 shrink-0 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <span className="text-xs font-bold text-yellow-400">{disconnectCountdown}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-yellow-300">Opponent disconnected</p>
            <p className="text-xs text-yellow-400/60">They have {disconnectCountdown}s to reconnect or they forfeit</p>
          </div>
        </div>
      )}

      {/* Main Board Container */}
      <div className="relative group mx-auto w-full max-w-[min(720px,calc(100vw-24px))] sm:max-w-[min(720px,65vh)] aspect-square transition-transform duration-500">
        <div className="absolute -inset-1 bg-linear-to-r from-blue-600/20 to-purple-600/20 rounded-xl blur-lg group-hover:opacity-100 opacity-50 transition-opacity" />
        <div className="relative h-full w-full overflow-hidden rounded-xl border border-white/10 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] bg-[#1a1816]">
          <Chessboard
            key={`board-${boardKey}-${orientation}`}
            options={{
              position: fen,
              boardOrientation: orientation,
              allowDragging: status === 'in-progress' && !!effectiveColor,
              boardStyle: { borderRadius: '4px' },
              darkSquareStyle: { backgroundColor: "#B58863" },
              lightSquareStyle: { backgroundColor: "#F0D9B5" },
              squareStyles: { ...lastMoveSquares, ...checkSquare, ...moveSquares, ...checkFlash },
              onSquareClick: onSquareClick,
              onPieceDrop: ({ sourceSquare, targetSquare }) => {
                if (!sourceSquare || !targetSquare) return false;
                return onDrop(sourceSquare, targetSquare);
              },
            }}
          />

          {status === "waiting" && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 animate-in fade-in duration-500">
              {/* <div className="text-center space-y-4">
                <div className="h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-white/60 font-medium">Initialize game options to start</p>
              </div> */}
            </div>
          )}

          {gameOver && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="w-full max-w-sm animate-in zoom-in-95 duration-300">
                <GlassBg className="p-5 sm:p-8 text-center" height="auto">
                  <div className="flex flex-col items-center gap-4 sm:gap-6">
                    <div className="relative">
                      <div className={`h-16 w-16 sm:h-20 sm:w-20 rounded-full flex items-center justify-center border border-white/10 shadow-xl ${gameOver.winner === 'draw' ? 'bg-linear-to-br from-yellow-500/20 to-orange-500/20 shadow-yellow-500/10' : gameOver.winner === playerColor || gameOver.winner === 'opponent' ? 'bg-linear-to-br from-green-500/20 to-blue-500/20 shadow-green-500/10' : 'bg-linear-to-br from-red-500/20 to-orange-500/20 shadow-red-500/10'}`}>
                        {gameOver.winner === 'draw' ? (
                          <svg className="h-8 w-8 sm:h-10 sm:w-10 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        ) : gameOver.winner === playerColor || gameOver.winner === 'opponent' ? (
                          <svg className="h-8 w-8 sm:h-10 sm:w-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
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
                        {gameOver.reason === 'disconnection' ? 'Opponent Disconnected' :
                          gameOver.reason === 'resignation' ? (gameOver.winner === playerColor || gameOver.winner === 'opponent' ? 'Opponent Resigned' : 'You Resigned') :
                            gameOver.reason === 'timeout' ? (gameOver.winner === playerColor || gameOver.winner === 'opponent' ? 'Opponent Ran Out of Time' : 'You Ran Out of Time') :
                              gameOver.reason === 'draw' ? 'Draw by Agreement' :
                                gameOver.reason}
                      </p>
                    </div>

                    {ratingChange !== null && (
                      <div className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold border ${ratingChange > 0 ? 'bg-green-500/10 text-green-400 border-green-500/20' : ratingChange < 0 ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
                        Rating: {player?.rating ?? 1200} {ratingChange > 0 ? `+${ratingChange}` : ratingChange === 0 ? '+0' : ratingChange} → {(player?.rating ?? 1200) + ratingChange}
                      </div>
                    )}

                    {/* Claim Prize button for staked games */}
                    {onChainGameId !== null && (gameOver.winner === playerColor || gameOver.winner === 'opponent' || gameOver.winner === 'draw') && (
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
                    )}

                    <button
                      onClick={() => window.location.reload()}
                      className="w-full relative group overflow-hidden rounded-full py-2.5 sm:py-3 transition-transform active:scale-95 mt-1 sm:mt-2"
                    >
                      <div className="absolute inset-0 bg-linear-to-r from-blue-600 to-purple-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                      <span className="relative text-sm font-bold text-white">Play Again</span>
                    </button>
                  </div>
                </GlassBg>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Info (Player) */}
      <div className="flex items-center justify-between rounded-2xl bg-[#1A1A1A]/80 px-4 py-3 border border-white/5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 shrink-0 rounded-full bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden">
            {player?.memoji ? (
              <Image src={player.memoji} alt="You" width={40} height={40} className="h-full w-full object-contain" />
            ) : (
              <span className="text-xs font-bold text-white/50">YOU</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">You(Player)</p>
            <p className="text-xs text-white/30">
              {status === 'in-progress' && isMyTurn ? 'Your move' : status === 'in-progress' ? 'Waiting for opponent' : 'Online'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {gameMode !== 'computer' && (
            <SignalStrength ping={ping} isConnected={!!socket?.connected} />
          )}
          <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1 bg-white ${(playerColor === 'white' ? whiteTime : blackTime) <= 30 ? 'animate-pulse' : ''}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-black/60">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-sm font-mono tabular-nums font-semibold text-black">
              {formatTime(playerColor === 'white' ? whiteTime : blackTime)}
            </span>
          </div>
        </div>
      </div>

      {/* Draw / End Game Controls */}
      {status === 'in-progress' && (
        <div className="flex items-center gap-6 px-1 pt-1">
          {['online', 'friend'].includes(gameMode || '') && (
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
          {['online', 'friend'].includes(gameMode || '') && (
            <button
              onClick={() => setShowResignModal(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-red-400 hover:text-red-300 transition-colors"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              End game
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
