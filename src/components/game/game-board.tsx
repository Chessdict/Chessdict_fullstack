"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Chess, Move } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useGameStore } from "@/stores/game-store";
import { getBestMove } from "@/lib/chess-ai";
import { useSocket } from "@/hooks/useSocket";
import { useAccount } from "wagmi";
import { ResignConfirmModal } from "./resign-confirm-modal";

export function GameBoard() {
  const {
    gameMode,
    status,
    difficulty,
    roomId,
    playerColor,
    opponent,
    setStatus,
    addMove,
    clearMoves,
    setOpponentConnected,

    gameOver,
    setGameOver,
    reset: resetStore
  } = useGameStore();

  const [ping, setPing] = useState<number>(0);
  const [showResignModal, setShowResignModal] = useState(false);

  const { address } = useAccount();
  const { socket } = useSocket(address ?? undefined);

  // Initialize the chess instance once and keep it stable.
  // We use fen as the source of truth for React rendering.
  const game = useMemo(() => new Chess(), []);
  const [fen, setFen] = useState(game.fen());

  // Diagnostic state to show in UI
  const [lastMove, setLastMove] = useState<Move | null>(null);

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
    }
  }, [status, game, syncState, clearMoves]);

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

    const handleGameOver = ({ winner, reason }: { winner: "white" | "black" | "draw" | "opponent"; reason: any }) => {
      console.log("[CLIENT] gameOver event received:", { winner, reason });
      setGameOver(winner, reason);
      setStatus("finished");
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

    // Ping interval
    const pingInterval = setInterval(() => {
      socket.emit("ping");
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
    socket.on('resignError', handleResignError);

    return () => {
      clearInterval(pingInterval);
      socket.off('opponentJoined', handleOpponentJoined);
      socket.off('opponentLeft', handleOpponentLeft);
      socket.off('gameOver', handleGameOver);
      socket.off('pong', handlePong);
      socket.off('resignError', handleResignError);
    };
  }, [socket, gameMode, roomId, opponent, setOpponentConnected, setGameOver, setStatus]);

  // Primary Move Handler for Chessboard
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
            <div className="text-sm font-bold text-white tracking-tight">
              {gameMode === 'computer' ? 'Stockfish' : opponent ? (opponent.address.slice(0, 6) + '...' + opponent.address.slice(-4)) : 'Waiting...'}
            </div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-white/30">
              {status === 'in-progress' && !isMyTurn ? 'Thinking...' : 'Waiting'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {['online', 'friend'].includes(gameMode || '') && (
            <div className="flex items-center gap-2 px-2 py-1 bg-black/40 rounded-lg border border-white/10" title={`Network Latency: ${ping}ms`}>
              <div className={`h-2 w-2 rounded-full ${ping < 100 ? 'bg-green-500' : ping < 300 ? 'bg-yellow-500' : 'bg-red-500'}`} />
              <span className="text-[10px] font-mono text-white/60">{ping}ms</span>
            </div>
          )}
          <div className="text-xl font-mono text-white/90 tabular-nums bg-black/40 px-3 py-1 rounded-lg border border-white/10">10:00</div>
        </div>
      </div>

      {/* Main Board Container */}
      <div className="relative group mx-auto w-full max-w-[720px] aspect-square transition-transform duration-500">
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
              onPieceDrop: ({ sourceSquare, targetSquare }) => {
                if (!sourceSquare || !targetSquare) return false;
                return onDrop(sourceSquare, targetSquare);
              },
            }}
          />

          {status === "waiting" && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-500">
              <div className="text-center space-y-4">
                <div className="h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-white/60 font-medium">Initialize game options to start</p>
              </div>
            </div>
          )}

          {gameOver && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in zoom-in-95 duration-300">
              <div className="bg-[#121212] border border-white/10 p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center">
                <div className={`mx-auto h-16 w-16 flex items-center justify-center rounded-full mb-4 ${gameOver.winner === playerColor || gameOver.winner === 'opponent' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {gameOver.winner === playerColor || gameOver.winner === 'opponent' ? (
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  )}
                </div>
                <h2 className="text-2xl font-black text-white mb-2">
                  {(gameOver.winner === playerColor || gameOver.winner === 'opponent') ? "YOU WON!" : "GAME OVER"}
                </h2>
                <p className="text-white/60 mb-6 capitalize">
                  {gameOver.reason === 'disconnection' ? 'Opponent Disconnected' :
                    gameOver.reason === 'resignation' ? (gameOver.winner === playerColor || gameOver.winner === 'opponent' ? 'Opponent Resigned' : 'You Resigned') :
                      gameOver.reason}
                </p>
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
              {isMyTurn && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,1)]" />}
            </div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-blue-400">
              {status === 'in-progress' ? (isMyTurn ? 'Your Turn' : 'Waiting for opponent') : 'Online'}
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
          <div className="text-xl font-mono text-white/90 tabular-nums bg-black/40 px-3 py-1 rounded-lg border border-white/10">10:00</div>
        </div>
      </div>

      {/* Resign Confirmation Modal */}
      <ResignConfirmModal
        isOpen={showResignModal}
        onConfirm={handleResign}
        onCancel={() => setShowResignModal(false)}
      />
    </div>
  );
}
