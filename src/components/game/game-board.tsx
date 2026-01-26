"use client";

import { useState, useEffect } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useGameStore } from "@/stores/game-store";

export function GameBoard() {
  const {
    gameMode,
    status,
    difficulty,
    setStatus
  } = useGameStore();

  const [game, setGame] = useState(new Chess());

  // Initialize/Reset game when status changes to waiting
  useEffect(() => {
    if (status === "waiting") {
      setGame(new Chess());
    }
  }, [status]);

  // Bot Logic
  useEffect(() => {
    if (status !== "in-progress" || gameMode !== "computer" || game.turn() !== "b") return;

    const makeComputerMove = () => {
      const possibleMoves = game.moves();
      if (game.isGameOver() || game.isDraw() || possibleMoves.length === 0) {
        // Game over logic could go here
        return;
      }

      // Simple AI based on difficulty
      let move;
      if (difficulty === "easy") {
        // Random move
        const randomIndex = Math.floor(Math.random() * possibleMoves.length);
        move = possibleMoves[randomIndex];
      } else {
        // Slightly smarter - capture if possible, otherwise greedy/random
        const captures = game.moves({ verbose: true }).filter(m => m.flags.includes('c') || m.flags.includes('e'));
        if (captures.length > 0 && Math.random() > 0.3) {
          move = captures[Math.floor(Math.random() * captures.length)].san;
        } else {
          const randomIndex = Math.floor(Math.random() * possibleMoves.length);
          move = possibleMoves[randomIndex];
        }
      }

      setGame((prev) => {
        const copy = new Chess(prev.fen());
        try {
          copy.move(move);
        } catch (e) { console.error(e) }
        return copy;
      });
    };

    const timer = setTimeout(makeComputerMove, 500 + Math.random() * 1000);
    return () => clearTimeout(timer);
  }, [game, gameMode, status, difficulty]);

  function onDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string }) {
    if (status !== "in-progress") return false;

    // Only allow moving white pieces in vs computer/online (assuming player is white for now)
    if (game.turn() !== 'w') return false;

    try {
      const gameCopy = new Chess(game.fen());
      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });

      if (move === null) return false;

      setGame(gameCopy);
      return true;
    } catch (error) {
      return false;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Opponent Info */}
      <div className="flex items-center justify-between rounded-xl bg-[#0A0A0A]/40 p-3 backdrop-blur-md border border-white/5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-full bg-linear-to-br from-white/20 to-transparent" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">
              {gameMode === 'computer' ? 'Stockfish (Bot)' : gameMode === 'online' ? 'Opponent' : 'Waiting...'}
            </span>
            <span className="text-xs text-white/40">
              {status === 'in-progress' ? 'Thinking...' : status === 'waiting' ? '...' : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-black/40 px-3 py-1.5 text-sm font-variant-numeric font-medium text-white/90 ring-1 ring-white/10">
          <svg className="h-3 w-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          10:00
        </div>
      </div>

      {/* Chess Board */}
      <div className="relative mx-auto w-full aspect-square">
        <div className="h-full w-full overflow-hidden rounded bg-[#1a1816] shadow-2xl">
          <Chessboard
            position={game.fen()}
            onPieceDrop={(source, target) => onDrop({ sourceSquare: source, targetSquare: target })}
            boardWidth={720}
            customBoardStyle={{
              borderRadius: '4px',
            }}
            customDarkSquareStyle={{ backgroundColor: "#B58863" }}
            customLightSquareStyle={{ backgroundColor: "#F0D9B5" }}
            arePiecesDraggable={status === 'in-progress' && game.turn() === 'w'}
          />
        </div>
        {status === "waiting" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
            <div className="rounded-xl bg-black/60 px-6 py-3 font-medium text-white shadow-xl border border-white/10">
              Select a mode to start
            </div>
          </div>
        )}
      </div>

      {/* Player Info */}
      <div className="flex items-center justify-between rounded-xl bg-[#0A0A0A]/40 p-3 backdrop-blur-md border border-white/5">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-full bg-white/10">
            <div className="absolute inset-0 bg-blue-500/20" />
            <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-black" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">You (Player)</span>
            <span className="text-xs text-white/40">Online</span>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-black/40 px-3 py-1.5 text-sm font-variant-numeric font-medium text-white/90 ring-1 ring-white/10">
          <svg className="h-3 w-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          10:00
        </div>
      </div>
    </div>
  );
}
