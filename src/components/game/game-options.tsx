"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/game-store";

type Tab = "new-game" | "games" | "players";

interface GameOptionsProps {
  onStartGame: () => void;
}

export function GameOptions({ onStartGame }: GameOptionsProps) {
  const [view, setView] = useState<"home" | "setup">("home");
  const [activeTab, setActiveTab] = useState<Tab>("new-game");
  const [timeControl, setTimeControl] = useState("10");
  const { gameMode, setGameMode } = useGameStore();

  if (view === "home") {
    const gameModes = [
      {
        id: "online",
        title: "Play online",
        onClick: () => {
          setGameMode("online");
          setView("setup");
        },
      },
      {
        id: "computer",
        title: "Play computer",
        onClick: () => {
          setGameMode("computer");
          setView("setup");
        },
      },
      {
        id: "friend",
        title: "Play a friend",
        onClick: () => { }, // TODO: Implement friend flow
      },
      {
        id: "tournament",
        title: "Tournament",
        onClick: () => { }, // TODO: Implement tournament flow
      },
    ];

    return (
      <div className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-[#0A0A0A]/40 p-6 backdrop-blur-xl transition-all duration-300">
        <div className="flex flex-col gap-3">
          {gameModes.map((mode) => (
            <button
              key={mode.id}
              onClick={mode.onClick}
              className="group relative flex h-[72px] w-full items-center justify-between rounded-full border border-white/10 bg-white/5 px-8 text-left transition-all hover:border-white/20 hover:bg-white/10 active:scale-[0.98]"
            >
              <span className="text-base font-medium text-white">{mode.title}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-colors group-hover:border-white/20 group-hover:text-white">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 rounded-[32px] border border-white/10 bg-[#0A0A0A]/40 p-6 backdrop-blur-xl transition-all duration-300">
      {/* Header */}
      <div className="relative flex items-center justify-between border-b border-white/10 pb-4">
        {gameMode === "online" ? (
          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveTab("new-game")}
              className={cn(
                "text-base font-medium transition-colors hover:text-white",
                activeTab === "new-game" ? "text-white pb-4 -mb-4.5 border-b-2 border-white" : "text-white/40"
              )}
            >
              New game
            </button>
            <button
              onClick={() => setActiveTab("games")}
              className={cn(
                "text-base font-medium transition-colors hover:text-white",
                activeTab === "games" ? "text-white pb-4 -mb-4.5 border-b-2 border-white" : "text-white/40"
              )}
            >
              Games
            </button>
            <button
              onClick={() => setActiveTab("players")}
              className={cn(
                "text-base font-medium transition-colors hover:text-white",
                activeTab === "players" ? "text-white pb-4 -mb-4.5 border-b-2 border-white" : "text-white/40"
              )}
            >
              Players
            </button>
          </div>
        ) : (
          <div className="text-base font-medium text-white">Play vs Computer</div>
        )}

        {/* Back button */}
        <button
          onClick={() => {
            setView("home");
            setGameMode(null);
          }}
          className="text-white/40 hover:text-white transition-colors"
        >
          <span className="sr-only">Back</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="min-h-[200px]">
        {gameMode === "computer" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium text-white/60">Difficulty</label>
              <div className="grid grid-cols-3 gap-2">
                {(["easy", "medium", "hard"] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => useGameStore.getState().setDifficulty(level)}
                    className={cn(
                      "rounded-xl border px-3 py-3 text-sm font-medium capitalize transition-all",
                      useGameStore.getState().difficulty === level
                        ? "border-white bg-white text-black"
                        : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={onStartGame}
              className="group relative flex w-full items-center justify-center overflow-hidden rounded-full py-4 transition-transform active:scale-95"
            >
              <div className="absolute inset-0 border border-white/20 rounded-full" />
              <div className="absolute inset-px rounded-full bg-linear-to-b from-white/10 to-transparent" />
              <span className="relative font-medium text-white">Start game</span>
              <div className="absolute bottom-0 h-px w-1/2 bg-white/50 blur-[2px]" />
            </button>
          </div>
        )}

        {gameMode === "online" && activeTab === "new-game" && (
          <div className="flex flex-col gap-6">
            <div className="relative">
              <select
                value={timeControl}
                onChange={(e) => setTimeControl(e.target.value)}
                className="w-full appearance-none rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white outline-none transition hover:bg-white/10 focus:border-white/20"
              >
                <option value="10" className="bg-[#0A0A0A]">10 min (Fast game)</option>
                <option value="30" className="bg-[#0A0A0A]">30 min (Standard)</option>
                <option value="60" className="bg-[#0A0A0A]">60 min (Long)</option>
              </select>
              <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/40">
                <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1.41 0.589996L6 5.17L10.59 0.589996L12 2L6 8L0 2L1.41 0.589996Z" fill="currentColor" />
                </svg>
              </div>
            </div>

            <button
              onClick={onStartGame}
              className="group relative flex w-full items-center justify-center overflow-hidden rounded-full py-4 transition-transform active:scale-95"
            >
              <div className="absolute inset-0 border border-white/20 rounded-full" />
              <div className="absolute inset-px rounded-full bg-linear-to-b from-white/10 to-transparent" />
              <span className="relative font-medium text-white">Start game</span>
              <div className="absolute bottom-0 h-px w-1/2 bg-white/50 blur-[2px]" />
            </button>
          </div>
        )}

        {gameMode === "online" && activeTab === "games" && (
          <div className="flex items-center justify-center py-10 text-white/40">
            No active games
          </div>
        )}

        {gameMode === "online" && activeTab === "players" && (
          <div className="flex items-center justify-center py-10 text-white/40">
            No players online
          </div>
        )}
      </div>
    </div>
  );
}

