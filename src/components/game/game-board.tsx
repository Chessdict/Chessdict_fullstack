"use client";

import { useState, useEffect } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

export function GameBoard() {
  const [game, setGame] = useState(new Chess());

  // Auto-play demo mode
  useEffect(() => {
    const makeRandomMove = () => {
      setGame((currentGame) => {
        const possibleMoves = currentGame.moves();

        // Game over - reset the game
        if (currentGame.isGameOver() || currentGame.isDraw() || possibleMoves.length === 0) {
          return new Chess();
        }

        // Pick a random move
        const randomIndex = Math.floor(Math.random() * possibleMoves.length);
        const move = possibleMoves[randomIndex];

        const gameCopy = new Chess(currentGame.fen());
        gameCopy.move(move);
        return gameCopy;
      });
    };

    // Make a move every 2 seconds
    const interval = setInterval(makeRandomMove, 2000);

    return () => clearInterval(interval);
  }, []); // Empty dependency array - only run once on mount

  function onDrop({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }) {
    // Disabled for demo mode - board plays itself
    return false;
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
            <span className="text-sm font-medium text-white">Opponent</span>
            <span className="text-xs text-white/40">......</span>
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
            options={{
              position: game.fen(),
              onPieceDrop: onDrop,
              allowDragging: false,
              boardStyle: {
                borderRadius: "4px",
                width: "100%",
                height: "100%",
              },
              darkSquareStyle: { backgroundColor: "#B58863" },
              lightSquareStyle: { backgroundColor: "#F0D9B5" },
            }}
          />
        </div>
      </div>

      {/* Player Info */}
      <div className="flex items-center justify-between rounded-xl bg-[#0A0A0A]/40 p-3 backdrop-blur-md border border-white/5">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-full bg-white/10">
            {/* Using Next.js Image would be better here if the asset exists, using a placeholder for now */}
            <div className="absolute inset-0 bg-blue-500/20" />
            {/* Hardcoded visual placeholder for "You" */}
            <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-black" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">You (Player)</span>
            <span className="text-xs text-white/40">......</span>
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

