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
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      {/* Opponent Info */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-white/10" />
        <span className="text-sm font-medium text-white/80">Opponent</span>
      </div>

      {/* Chess Board */}
      <div className="relative mx-auto w-full max-w-2xl">
        <div className="rounded-lg overflow-hidden border-2 border-white/20">
          <Chessboard
            options={{
              position: game.fen(),
              onPieceDrop: onDrop,
              allowDragging: false, // Disabled for demo mode
              boardStyle: {
                borderRadius: "0",
                width: "100%",
                maxWidth: "800px",
              },
              darkSquareStyle: { backgroundColor: "#8b5a3c" },
              lightSquareStyle: { backgroundColor: "#d4a574" },
              dropSquareStyle: {
                boxShadow: "inset 0 0 1px 4px rgba(59, 130, 246, 0.5)",
              },
            }}
          />
        </div>
      </div>

      {/* Player Info */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-white/10" />
        <span className="text-sm font-medium text-white/80">You (Player)</span>
      </div>
    </div>
  );
}

