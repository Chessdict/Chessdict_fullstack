"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/game-store";
import Image from "next/image";
import { GlassButton } from "../glass-button";
import { GlassBg } from "../glass-bg";

type Tab = "new-game" | "games" | "players";

interface GameOptionsProps {
  onStartGame: () => void;
}

const mockOpponents = [
  { id: 1, name: "Ezeugwu Romanus", address: "CTYZ..ZgXe", avatar: "/images/king_pin.svg" }, // using placeholder avatar
  { id: 2, name: "Ezeugwu Romanus", address: "CTYZ..2gXs", avatar: "/images/king_pin.svg" },
  { id: 3, name: "Ezeugwu Romanus", address: "CTYZ..2gXe", avatar: "/images/king_pin.svg" },
  { id: 4, name: "Ezeugwu Romanus", address: "CTYZ..2gXe", avatar: "/images/king_pin.svg" },
  { id: 5, name: "Ezeugwu Romanus", address: "CTYZ..2gXs", avatar: "/images/king_pin.svg" },
];

const SelectGameDuration = ({ timeControl, setTimeControl }: { timeControl: string; setTimeControl: (value: string) => void }) => (
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
)

export function GameOptions({ onStartGame }: GameOptionsProps) {
  const [view, setView] = useState<"home" | "setup">("home");
  const [activeTab, setActiveTab] = useState<Tab>("new-game");
  const [timeControl, setTimeControl] = useState("10");
  const { gameMode, setGameMode } = useGameStore();
  const [selectedOpponent, setSelectedOpponent] = useState<{ id: number, name: string, address: string, avatar: string } | null>(null);

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
        onClick: () => {
          setGameMode("friend");
          setView("setup");
        }, // TODO: Implement friend flow
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
        {gameMode === "online" || gameMode === "friend" ? (
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
            <SelectGameDuration timeControl={timeControl} setTimeControl={setTimeControl} />

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

        {
          gameMode === "friend" && activeTab === "new-game" && !selectedOpponent && (
            <div>
              <div className="flex flex-col items-start justify-center pb-10 text-white/40 gap-y-5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setView("home");
                      setGameMode(null);
                    }}
                    className="cursor-pointer">
                    <Image
                      src="/icons/left-arrow.svg"
                      alt="left-arrow"
                      width={24}
                      height={24}
                      className=""
                    />
                  </button>
                  <p className="text-lg font-medium text-white">Play A Friend</p>
                </div>

                <div className="w-full">
                  <GlassBg
                    className=""
                    height={50}
                  >
                    <div className="w-full flex items-center gap-2.5 rounded-full p-5">
                      <Image
                        src="/icons/search-icon.svg"
                        alt="search-icon"
                        width={18}
                        height={18}
                        className=""
                      />

                      <input
                        type="text"
                        placeholder="Search username..."
                        className="w-full text-xs font-light text-white outline-0"
                      />
                    </div>
                  </GlassBg>
                </div>

                <div className="w-full space-y-1">
                  <p className="text-sm font-normal">Recent Opponents</p>
                  <div className="flex max-h-[300px] flex-col gap-1 overflow-y-auto pb-4">
                    {mockOpponents.map((opponent, index) => (
                      <button
                        key={`${opponent.id}-${index}`}
                        onClick={() => {
                          setSelectedOpponent(opponent);
                        }}
                        className="flex items-center gap-3 rounded-2xl pt-3 pb-3 pr-3 text-left transition-colors hover:bg-white/5 hover:cursor-pointer"
                      >
                        <div className="relative h-10 w-10 overflow-hidden rounded-full bg-red-400">
                          {/* Avatar placeholder - colored bg if image fails */}
                          <Image
                            src={opponent.avatar}
                            alt={opponent.name}
                            fill
                            className="object-cover"
                            onError={(e) => {
                              // Fallback logic could go here, but purely CSS/div based fallback is safer for now if image missing
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-white">{opponent.name}</span>
                          <span className="text-xs text-white/40">{opponent.address}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        }

        {
          gameMode === "friend" && activeTab === "new-game" && selectedOpponent && (
            <div>
              <div className="flex flex-col items-start justify-center pb-10 text-white/40 gap-y-5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedOpponent(null);
                    }}
                    className="cursor-pointer">
                    <Image
                      src="/icons/left-arrow.svg"
                      alt="left-arrow"
                      width={24}
                      height={24}
                      className=""
                    />
                  </button>
                </div>

                <div
                  className="w-full flex flex-col items-center justify-center gap-4 rounded-2xl pt-3 pb-3 pr-3 text-left"
                >
                  <div className="w-full flex flex-col items-center justify-center gap-3">
                    <div className="relative h-30 w-30 overflow-hidden rounded-full bg-red-400">
                      {/* Avatar placeholder - colored bg if image fails */}
                      <Image
                        src={selectedOpponent.avatar}
                        alt={selectedOpponent.name}
                        width={120}
                        height={120}
                        className="object-cover w-full h-full"
                        onError={(e) => {
                          // Fallback logic could go here, but purely CSS/div based fallback is safer for now if image missing
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    </div>
                    <div className="flex flex-col text-white text-center">
                      <span className="text-lg font-medium">{selectedOpponent.name}</span>
                      <span className="text-xs font-light">{selectedOpponent.address}</span>
                    </div>
                  </div>

                  <div className="w-full">
                    <SelectGameDuration timeControl={timeControl} setTimeControl={setTimeControl} />
                  </div>

                  <div className="w-full flex flex-col items-center gap-5">
                    <GlassButton className="hover:cursor-pointer w-full">Send challenge</GlassButton>
                    <button
                      className="flex items-center gap-2 font-sm text-white hover:cursor-pointer"
                    >
                      <Image
                        src="/icons/clipboard-icon.svg"
                        alt="clipboard-icon"
                        width={24}
                        height={24}
                        className=""
                      />
                      Copy link
                    </button>
                  </div>

                </div>
              </div>
            </div>
          )
        }
      </div>
    </div>
  );
}

