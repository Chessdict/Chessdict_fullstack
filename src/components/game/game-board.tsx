"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Chess, Move } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useGameStore } from "@/stores/game-store";
import { getBestMove } from "@/lib/chess-ai";
import { useSocket } from "@/hooks/useSocket";
import { useAccount } from "wagmi";
import { ResignConfirmModal } from "./resign-confirm-modal";
import { DrawOfferModal } from "./draw-offer-modal";


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
    decrementWhiteTime,
    decrementBlackTime,
    resetTimers,
    gameOver,
    setGameOver,
    drawOfferReceived,
    setDrawOfferReceived,
    setDrawOfferSent,
    reset: resetStore
  } = useGameStore();

  const [ping, setPing] = useState<number>(0);
  const [opponentPing, setOpponentPing] = useState<number>(0);
  const [showResignModal, setShowResignModal] = useState(false);
  const [ratingChange, setRatingChange] = useState<number | null>(null);
  const [checkFlash, setCheckFlash] = useState<Record<string, React.CSSProperties>>({});

  const { address } = useAccount();
  const { socket } = useSocket(address ?? undefined);


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

        return result;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }, [game, syncState, addMove]);

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

  // Handle timeout (time runs out)
  useEffect(() => {
    if (status !== "in-progress") return;
    if (gameOver) return;

    const currentTurnForTimer = game.turn();
    const timeoutPlayer = currentTurnForTimer === 'w' ? whiteTime : blackTime;

    if (timeoutPlayer <= 0) {
      const winner = currentTurnForTimer === 'w' ? 'black' : 'white';
      console.log(`[CLIENT] Timeout! ${winner} wins`);

      // For multiplayer games, notify the server
      const isMultiplayer = gameMode === 'online' || gameMode === 'friend';
      if (isMultiplayer && socket && roomId) {
        console.log("[CLIENT] Emitting timeout event:", { roomId, winner });
        socket.emit("gameTimeout", { roomId, loser: currentTurnForTimer === 'w' ? 'white' : 'black' });
      }

      setGameOver(winner, "timeout");
      setStatus("finished");
    }
  }, [whiteTime, blackTime, status, gameOver, game, gameMode, socket, roomId, setGameOver, setStatus]);

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
    }
  }, [fen, status, game, gameMode, socket, roomId, setGameOver, setStatus]);

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
    };
  }, [socket, gameMode, roomId, opponent, setOpponentConnected, setGameOver, setStatus, setDrawOfferReceived, setDrawOfferSent]);

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
            socket?.emit("movePiece", { roomId, move: moveData });
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
        socket?.emit("movePiece", { roomId, move: moveData });
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
    <div className="flex flex-col gap-4">
      {/* Top Info (Opponent) */}
      <div className="flex items-center justify-between rounded-xl bg-[#0A0A0A]/60 p-4 backdrop-blur-xl border border-white/5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-full bg-linear-to-br from-red-500/20 to-transparent border border-white/10 ring-2 ring-red-500/20">
            <div className="h-full w-full flex items-center justify-center text-xs font-bold text-white/40 uppercase">
              {gameMode === 'computer' ? 'AI' : opponent?.address.slice(2, 4) || '??'}
            </div>
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              {gameMode === 'computer' ? 'Stockfish' : opponent ? (opponent.address.slice(0, 6) + '...' + opponent.address.slice(-4)) : 'Waiting...'}
              {opponent && <span className="text-[10px] font-mono text-white/40 bg-white/5 px-1.5 py-0.5 rounded">{opponent.rating}</span>}
            </div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-white/30">
              {status === 'in-progress' && !isMyTurn ? 'Thinking...' :
                lastMove && lastMove.color !== playerTurnCode
                  ? <span className="normal-case tracking-normal text-white/50">
                    played <span className="text-base leading-none align-middle">{pieceSymbols[lastMove.piece]?.[lastMove.color] || ''}</span> {lastMove.san}
                  </span>
                  : 'Waiting'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {['online', 'friend'].includes(gameMode || '') && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-black/40 rounded-lg border border-white/10" title={`Opponent Latency: ${opponentPing}ms`}>
              <div className="flex items-end gap-0.5 h-3.5">
                {[1, 2, 3, 4].map((bar) => {
                  const strength = opponentPing < 80 ? 4 : opponentPing < 150 ? 3 : opponentPing < 300 ? 2 : 1;
                  const color = strength >= 3 ? 'bg-green-500' : strength === 2 ? 'bg-yellow-500' : 'bg-red-500';
                  const isActive = bar <= strength;
                  return (
                    <div
                      key={bar}
                      className={`w-0.75 rounded-sm ${isActive ? color : 'bg-white/15'}`}
                      style={{ height: `${bar * 25}%` }}
                    />
                  );
                })}
              </div>
              <span className="text-[10px] font-mono text-white/60">{opponentPing}ms</span>
            </div>
          )}
          {/* Opponent's timer */}
          <div className={`text-xl font-mono tabular-nums px-3 py-1 rounded-lg border ${!isMyTurn && status === 'in-progress'
            ? 'bg-red-500/20 border-red-500/30 text-red-400'
            : 'bg-black/40 border-white/10 text-white/90'
            } ${(playerColor === 'white' ? blackTime : whiteTime) <= 30 ? 'animate-pulse' : ''}`}>
            {formatTime(playerColor === 'white' ? blackTime : whiteTime)}
          </div>
        </div>
      </div>

      {/* Main Board Container */}
      <div className="relative group mx-auto w-full max-w-[min(720px,65vh)] aspect-square transition-transform duration-500">
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
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in zoom-in-95 duration-300">
              <div className="bg-[#121212] border border-white/10 p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center">
                <div className={`mx-auto h-16 w-16 flex items-center justify-center rounded-full mb-4 ${gameOver.winner === 'draw' ? 'bg-yellow-500/20 text-yellow-400' : gameOver.winner === playerColor || gameOver.winner === 'opponent' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {gameOver.winner === 'draw' ? (
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  ) : gameOver.winner === playerColor || gameOver.winner === 'opponent' ? (
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  )}
                </div>
                <h2 className="text-2xl font-black text-white mb-2">
                  {gameOver.winner === 'draw' ? "DRAW" : (gameOver.winner === playerColor || gameOver.winner === 'opponent') ? "YOU WON!" : "GAME OVER"}
                </h2>
                <p className="text-white/60 mb-4 capitalize">
                  {gameOver.reason === 'disconnection' ? 'Opponent Disconnected' :
                    gameOver.reason === 'resignation' ? (gameOver.winner === playerColor || gameOver.winner === 'opponent' ? 'Opponent Resigned' : 'You Resigned') :
                      gameOver.reason === 'timeout' ? (gameOver.winner === playerColor || gameOver.winner === 'opponent' ? 'Opponent Ran Out of Time' : 'You Ran Out of Time') :
                        gameOver.reason === 'draw' ? 'Draw by Agreement' :
                          gameOver.reason}
                </p>
                {ratingChange !== null && (
                  <div className={`mb-4 px-3 py-2 rounded-lg text-sm font-bold ${ratingChange > 0 ? 'bg-green-500/20 text-green-400' : ratingChange < 0 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    Rating: {player?.rating ?? 1200} {ratingChange > 0 ? `+${ratingChange}` : ratingChange === 0 ? '+0' : ratingChange} → {(player?.rating ?? 1200) + ratingChange}
                  </div>
                )}
                <button
                  onClick={() => window.location.reload()}
                  className="w-full py-3 rounded-xl bg-white text-black font-bold hover:bg-gray-200 transition-colors"
                >
                  Play Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Info (Player) */}
      <div className="flex items-center justify-between rounded-xl bg-[#0A0A0A]/60 p-4 backdrop-blur-xl border border-white/5 shadow-2xl transition-all">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-full bg-linear-to-br from-blue-500/20 to-transparent border border-white/10 ring-2 ring-blue-500/20">
            <div className="h-full w-full flex items-center justify-center text-xs font-bold text-white/40">YOU</div>
            <div className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          </div>
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              You ({playerColor || 'White'})
              {player && <span className="text-[10px] font-mono text-white/40 bg-white/5 px-1.5 py-0.5 rounded">{player.rating}</span>}
              {isMyTurn && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,1)]" />}
            </div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-blue-400">
              {status === 'in-progress' ? (isMyTurn ? 'Your Turn' :
                lastMove && lastMove.color === playerTurnCode
                  ? <span className="normal-case tracking-normal text-white/50">
                    played <span className="text-base leading-none align-middle">{pieceSymbols[lastMove.piece]?.[lastMove.color] || ''}</span> {lastMove.san}
                  </span>
                  : 'Waiting for opponent') : 'Online'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status === 'in-progress' && ['online', 'friend'].includes(gameMode || '') && (
            <button
              onClick={() => {
                console.log("[CLIENT] Resign button clicked - opening modal");
                setShowResignModal(true);
              }}
              className="flex items-center gap-1 text-[10px] font-bold text-red-500/80 hover:text-red-400 uppercase tracking-widest px-2 py-1 hover:bg-red-500/10 rounded transition-all"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
              Resign
            </button>
          )}
          {status === 'in-progress' && gameMode === 'computer' && (
            <button
              onClick={() => {
                if (confirm("Reset current board? (Local only)")) {
                  game.reset();
                  syncState();
                }
              }}
              className="text-[10px] uppercase font-black text-white/20 hover:text-white/60 transition-colors"
            >
              Force Reset
            </button>
          )}
          {['online', 'friend'].includes(gameMode || '') && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-black/40 rounded-lg border border-white/10" title={`Network Latency: ${ping}ms`}>
              <div className="flex items-end gap-0.5 h-3.5">
                {[1, 2, 3, 4].map((bar) => {
                  const strength = ping < 80 ? 4 : ping < 150 ? 3 : ping < 300 ? 2 : 1;
                  const color = strength >= 3 ? 'bg-green-500' : strength === 2 ? 'bg-yellow-500' : 'bg-red-500';
                  const isActive = bar <= strength;
                  return (
                    <div
                      key={bar}
                      className={`w-0.75 rounded-sm ${isActive ? color : 'bg-white/15'}`}
                      style={{ height: `${bar * 25}%` }}
                    />
                  );
                })}
              </div>
              <span className="text-[10px] font-mono text-white/60">{ping}ms</span>
            </div>
          )}
          {/* Player's timer */}
          <div className={`text-xl font-mono tabular-nums px-3 py-1 rounded-lg border ${isMyTurn && status === 'in-progress'
            ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
            : 'bg-black/40 border-white/10 text-white/90'
            } ${(playerColor === 'white' ? whiteTime : blackTime) <= 30 ? 'animate-pulse' : ''}`}>
            {formatTime(playerColor === 'white' ? whiteTime : blackTime)}
          </div>
        </div>
      </div>

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
