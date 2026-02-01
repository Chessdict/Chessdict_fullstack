"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Chess, Move } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useGameStore } from "@/stores/game-store";
import { getBestMove } from "@/lib/chess-ai";
import { useSocket } from "@/hooks/useSocket";
import { useAccount } from "wagmi";

export function GameBoard() {
  const {
    gameMode,
    status,
    difficulty,
    roomId,
    playerColor,
    opponent,
    setStatus,
    reset: resetStore
  } = useGameStore();

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
        console.log("INTERNAL: Move success", { move, turn: game.turn(), fen: game.fen() });
        return result;
      }
    } catch (e) {
      console.error("INTERNAL: Move error", e);
    }
    return null;
  }, [game, syncState]);

  // Handle Game Initialization / Resets
  useEffect(() => {
    if (status === "waiting") {
      game.reset();
      syncState();
      setLastMove(null);
      console.log("GAME: Board reset to start position");
    }
  }, [status, game, syncState]);

  // Bot Logic
  useEffect(() => {
    if (status !== "in-progress" || gameMode !== "computer") return;

    const turn = game.turn();
    // In computer mode, player is white by default if not set
    const myColor = playerColor || 'white';
    const botTurnCode = myColor === 'white' ? 'b' : 'w';

    if (turn === botTurnCode) {
      console.log("BOT: Bot thinking...");
      const timeoutId = setTimeout(() => {
        const move = getBestMove(new Chess(game.fen()), difficulty);
        if (move) {
          console.log("BOT: Bot making move", move);
          safeMove(move);
        }
      }, 600);
      return () => clearTimeout(timeoutId);
    }
  }, [fen, status, gameMode, playerColor, difficulty, game, safeMove]);

  // Join room when entering multiplayer game
  useEffect(() => {
    const isMultiplayer = gameMode === 'online' || gameMode === 'friend';
    if (!socket || !isMultiplayer || !roomId) return;

    // Explicitly join the room to ensure we receive opponent moves
    // This handles cases where socket reconnects or component remounts
    const joinRoom = () => {
      console.log("NETWORK: Joining room", roomId);
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
      console.log("NETWORK: Received opponent move", move);
      safeMove(move);
    };

    socket.on('opponentMove', handleOpponentMove);
    return () => { socket.off('opponentMove', handleOpponentMove); };
  }, [socket, gameMode, roomId, safeMove]);

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

    console.log("ACTION: Drag drop detected", { source, target, turn, myTurnCode, myColor });

    if (turn !== myTurnCode) {
      console.warn(`ACTION: Not your turn. Current turn: ${turn}, You: ${myTurnCode}`);
      return false;
    }

    const moveData = { from: source, to: target, promotion: "q" };
    const result = safeMove(moveData);

    if (result) {
      if (isMultiplayer && roomId) {
        console.log("NETWORK: Emitting move", moveData);
        socket?.emit("movePiece", { roomId, move: moveData });
      }
      return true;
    }

    console.warn("ACTION: Illegal move rejected", moveData);
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
      console.log("BOARD: Color set, forcing remount. Color:", playerColor);
    }
  }, [playerColor]);

  // Determine if it's the player's turn
  const currentTurn = game.turn(); // 'w' or 'b'
  const playerTurnCode = effectiveColor === 'black' ? 'b' : 'w';
  const isMyTurn = currentTurn === playerTurnCode;

  // Debug Hook: expose game instance for console troubleshooting
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).game = game;
    }
  }, [game]);

  // Debug: Log orientation changes
  useEffect(() => {
    console.log("BOARD DEBUG:", {
      playerColor,
      effectiveColor,
      orientation,
      gameMode,
      status,
      roomId
    });
  }, [playerColor, effectiveColor, orientation, gameMode, status, roomId]);

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
          {status === 'in-progress' && (
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

    </div>
  );
}
