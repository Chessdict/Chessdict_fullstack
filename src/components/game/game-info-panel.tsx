"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/stores/game-store";
import { cn } from "@/lib/utils";

interface GameInfoPanelProps {
  isSocketConnected: boolean;
}

export function GameInfoPanel({ isSocketConnected }: GameInfoPanelProps) {
  const {
    status,
    gameMode,
    player,
    opponent,
    playerColor,
    moves,
    isOpponentConnected,
    setStatus,
    reset,
  } = useGameStore();

  const movesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest move
  useEffect(() => {
    movesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [moves]);

  // Group moves into pairs (white, black)
  const movePairs: { moveNumber: number; white?: string; black?: string }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i]?.san,
      black: moves[i + 1]?.san,
    });
  }

  const isWaitingForOpponent = status === "matched" || (status === "in-progress" && !opponent);
  const isGameActive = status === "in-progress";

  return (
    <div className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-[#0A0A0A]/40 p-6 backdrop-blur-xl">
      {/* Connection Status */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-2 w-2 rounded-full",
              isSocketConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
            )}
          />
          <span className="text-sm text-white/60">
            {isSocketConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <span className="text-xs text-white/40 uppercase tracking-wider">
          {gameMode === "computer" ? "vs Computer" : "Online Match"}
        </span>
      </div>

      {/* Waiting State */}
      {isWaitingForOpponent && (
        <div className="flex flex-col items-center justify-center py-8 gap-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-white/10 border-t-blue-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 rounded-full bg-blue-500/20" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-white font-medium">Waiting for opponent...</p>
            <p className="text-sm text-white/40 mt-1">Game will start when both players are ready</p>
          </div>
        </div>
      )}

      {/* Players Info */}
      {isGameActive && opponent && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Players</h3>

          {/* Opponent */}
          <div className="flex items-center justify-between rounded-xl bg-white/5 p-3">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-red-500/20 to-transparent border border-white/10 flex items-center justify-center">
                <span className="text-xs font-bold text-white/60 uppercase">
                  {gameMode === "computer" ? "AI" : opponent.address.slice(2, 4)}
                </span>
                <div
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0A0A0A]",
                    gameMode === "computer" || isOpponentConnected ? "bg-green-500" : "bg-yellow-500"
                  )}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  {gameMode === "computer" ? "Stockfish AI" : `${opponent.address.slice(0, 6)}...${opponent.address.slice(-4)}`}
                </p>
                <p className="text-xs text-white/40">
                  {playerColor === "white" ? "Black" : "White"} pieces
                </p>
              </div>
            </div>
            <span className="text-xs text-white/30">
              {gameMode === "computer" || isOpponentConnected ? "Online" : "Connecting..."}
            </span>
          </div>

          {/* You */}
          <div className="flex items-center justify-between rounded-xl bg-blue-500/10 border border-blue-500/20 p-3">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-blue-500/20 to-transparent border border-blue-500/30 flex items-center justify-center">
                <span className="text-xs font-bold text-blue-400">YOU</span>
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0A0A0A] bg-green-500 animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  {player ? `${player.address.slice(0, 6)}...${player.address.slice(-4)}` : "You"}
                </p>
                <p className="text-xs text-blue-400">
                  {playerColor === "white" ? "White" : "Black"} pieces
                </p>
              </div>
            </div>
            <span className="text-xs text-green-400">Online</span>
          </div>
        </div>
      )}

      {/* Move History */}
      {isGameActive && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Move History</h3>
          <div className="max-h-[200px] overflow-y-auto rounded-xl bg-white/5 p-3 scrollbar-thin scrollbar-thumb-white/10">
            {movePairs.length === 0 ? (
              <p className="text-center text-sm text-white/30 py-4">No moves yet</p>
            ) : (
              <div className="space-y-1">
                {movePairs.map((pair) => (
                  <div
                    key={pair.moveNumber}
                    className="grid grid-cols-[32px_1fr_1fr] gap-2 text-sm"
                  >
                    <span className="text-white/30 font-mono">{pair.moveNumber}.</span>
                    <span className={cn(
                      "font-medium font-mono px-2 py-0.5 rounded",
                      pair.white ? "text-white bg-white/5" : ""
                    )}>
                      {pair.white || ""}
                    </span>
                    <span className={cn(
                      "font-medium font-mono px-2 py-0.5 rounded",
                      pair.black ? "text-white bg-white/5" : ""
                    )}>
                      {pair.black || ""}
                    </span>
                  </div>
                ))}
                <div ref={movesEndRef} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Game Controls */}
      {isGameActive && gameMode !== "computer" && (
        <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                // TODO: Implement draw offer
              }}
              className="flex items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-3 text-sm font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Offer Draw
            </button>
            <button
              onClick={() => {
                if (confirm("Are you sure you want to resign?")) {
                  setStatus("finished");
                }
              }}
              className="flex items-center justify-center gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-400 transition hover:bg-red-500/20"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
              Resign
            </button>
          </div>
        </div>
      )}

      {/* Back to Menu Button */}
      <button
        onClick={() => {
          if (isGameActive) {
            if (!confirm("Leave current game?")) return;
          }
          reset();
        }}
        className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Menu
      </button>
    </div>
  );
}
