"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/game-store";
import Image from "next/image";
import { GlassButton } from "../glass-button";
import { GlassBg } from "../glass-bg";
import { searchUsers, getRecentOpponents } from "@/app/actions";
import { toast } from "sonner";
import { GameInfoPanel } from "./game-info-panel";
import { TournamentPanel } from "../tournament/tournament-panel";
import {
  useChessdict,
  useTokenSymbol,
  useTokenDecimals,
  useTokenBalance,
} from "@/hooks/useChessdict";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { DEFAULT_STAKE_TOKEN } from "@/lib/contract";

type Tab = "new-game" | "games" | "players";

export interface StakeInfo {
  staked: true;
  token: string;
  stakeAmount: string;
}

interface GameOptionsProps {
  onStartGame: (stakeInfo?: StakeInfo) => void;
  socket: any;
  userId?: string;
  isSocketConnected?: boolean;
}

interface Opponent {
  id: any;
  walletAddress: string;
  name?: string;
  avatar?: string;
}


// ─── Stake Panel ─────────────────────────────────────────────────────────────

function TokenPill({ token, onChange }: { token: `0x${string}`; onChange: (v: `0x${string}` | null) => void }) {
  const { data: symbol } = useTokenSymbol(token);
  const { data: decimals } = useTokenDecimals(token);
  const { address } = useAccount();
  const { data: balance } = useTokenBalance(token, address);
  const [editing, setEditing] = useState(false);

  const displayBalance =
    balance !== undefined && decimals !== undefined
      ? Number(formatUnits(balance as bigint, decimals as number)).toFixed(4)
      : "…";

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        placeholder="0x…"
        defaultValue={token}
        onBlur={(e) => {
          const val = e.target.value.trim();
          onChange(val ? (val as `0x${string}`) : null);
          setEditing(false);
        }}
        className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs text-white outline-none"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left transition hover:bg-white/10"
    >
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-white">
          {(symbol as string) ?? "ERC-20"}
        </span>
        <span className="text-xs text-white/40">
          {token.slice(0, 6)}…{token.slice(-4)}
        </span>
      </div>
      <div className="text-right">
        <span className="text-xs text-white/60">Balance</span>
        <p className="text-sm font-medium text-white">{displayBalance}</p>
      </div>
    </button>
  );
}

interface StakePanelProps {
  stakeEnabled: boolean;
  setStakeEnabled: (v: boolean) => void;
  selectedToken: `0x${string}` | null;
  setSelectedToken: (v: `0x${string}` | null) => void;
  stakeAmount: string;
  setStakeAmount: (v: string) => void;
}

function StakePanel({
  stakeEnabled,
  setStakeEnabled,
  selectedToken,
  setSelectedToken,
  stakeAmount,
  setStakeAmount,
}: StakePanelProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">Stake</span>
        <button
          onClick={() => setStakeEnabled(!stakeEnabled)}
          className={cn(
            "relative h-6 w-11 rounded-full transition-colors duration-200",
            stakeEnabled ? "bg-blue-600" : "bg-white/10"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
              stakeEnabled ? "translate-x-5" : "translate-x-0"
            )}
          />
        </button>
      </div>

      {stakeEnabled && (
        <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/60">Token <span className="text-white/30">(tap to change)</span></label>
            {selectedToken ? (
              <TokenPill token={selectedToken} onChange={setSelectedToken} />
            ) : (
              <input
                autoFocus
                type="text"
                placeholder="Paste token address…"
                onChange={(e) => {
                  const val = e.target.value.trim();
                  if (val.startsWith("0x") && val.length === 42)
                    setSelectedToken(val as `0x${string}`);
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 font-mono text-xs text-white outline-none transition hover:bg-white/10 placeholder:text-white/20"
              />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/60">Amount</label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 10"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition hover:bg-white/10 placeholder:text-white/20"
            />
          </div>
        </div>
      )}
    </div>
  );
}

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

export function GameOptions({ onStartGame, socket, userId, isSocketConnected = false }: GameOptionsProps) {
  // All hooks must be called before any early returns
  const [view, setView] = useState<"home" | "setup">("home");
  const [activeTab, setActiveTab] = useState<Tab>("new-game");
  const [timeControl, setTimeControl] = useState("10");
  const { gameMode, setGameMode, status, setStakeToken } = useGameStore();
  const [selectedOpponent, setSelectedOpponent] = useState<Opponent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentOpponents, setRecentOpponents] = useState<any[]>([]);
  const [onlineStatus, setOnlineStatus] = useState<Record<string, string>>({});

  // Staking state
  const [stakeEnabled, setStakeEnabled] = useState(false);
  const [selectedToken, setSelectedToken] = useState<`0x${string}` | null>(DEFAULT_STAKE_TOKEN);
  const [stakeAmount, setStakeAmount] = useState("");

  const { createGameSingle, isLoading: isStaking } = useChessdict(); // used by friend challenge
  const { data: tokenDecimalsData } = useTokenDecimals(selectedToken);

  useEffect(() => {
    if (userId) {
      getRecentOpponents(userId).then(res => {
        if (res && res.success) setRecentOpponents(res.opponents || []);
      });
    }
  }, [userId]);

  useEffect(() => {
    if (!socket) return;

    const interval = setInterval(() => {
      const idsToCheck = [
        ...searchResults.map(u => u.walletAddress),
        ...recentOpponents.map(u => u.walletAddress)
      ];
      if (idsToCheck.length > 0) {
        socket.emit("checkStatus", { userIds: idsToCheck });
      }
    }, 5000);

    socket.on("statusUpdate", ({ statusMap }: { statusMap: Record<string, string> }) => {
      setOnlineStatus(prev => ({ ...prev, ...statusMap }));
    });

    return () => {
      clearInterval(interval);
      socket.off("statusUpdate");
    };
  }, [socket, searchResults, recentOpponents]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const result = await searchUsers(query);
    setIsSearching(false);

    if (result.success) {
      setSearchResults(result.users || []);
    }
  };

  // Show GameInfoPanel when game is active (after all hooks)
  if (status === "in-progress" || status === "matched") {
    return <GameInfoPanel isSocketConnected={isSocketConnected} />;
  }

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
      // {
      //   id: "computer",
      //   title: "Play computer",
      //   onClick: () => {
      //     setGameMode("computer");
      //     setView("setup");
      //   },
      // },
      {
        id: "friend",
        title: "Play a friend",
        onClick: () => {
          setGameMode("friend");
          setView("setup");
        },
      },
      {
        id: "tournament",
        title: "Tournament",
        onClick: () => {
          setGameMode("tournament");
          setView("setup");
        },
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
      <div className="relative flex items-center justify-between border-b border-white/10 pb-4">
        {gameMode === "tournament" ? (
          <div className="text-base font-medium text-white">Tournament</div>
        ) : gameMode === "online" || gameMode === "friend" ? (
          <div className="flex items-center gap-6">
            {/* <button
              onClick={() => setActiveTab("new-game")}
              className={cn(
                "text-base font-medium transition-colors hover:text-white",
                activeTab === "new-game" ? "text-white pb-4 -mb-4.5 border-b-2 border-white" : "text-white/40"
              )}
            >
              New game
            </button> */}
            <button
              onClick={() => setActiveTab("games")}
              className={cn(
                "text-base font-medium transition-colors hover:text-white",
                activeTab === "games" ? "text-white pb-4 -mb-4.5 border-b-2 border-white" : "text-white/40"
              )}
            >
              Game History
            </button>
            {/* <button
              onClick={() => setActiveTab("players")}
              className={cn(
                "text-base font-medium transition-colors hover:text-white",
                activeTab === "players" ? "text-white pb-4 -mb-4.5 border-b-2 border-white" : "text-white/40"
              )}
            >
              Players
            </button> */}
          </div>
        ) : (
          <div className="text-base font-medium text-white">Play vs Computer</div>
        )}

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

      <div className="min-h-[200px]">
        {gameMode === "tournament" && (
          <TournamentPanel />
        )}

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
              onClick={() => onStartGame()}
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

            <StakePanel
              stakeEnabled={stakeEnabled}
              setStakeEnabled={setStakeEnabled}
              selectedToken={selectedToken}
              setSelectedToken={setSelectedToken}
              stakeAmount={stakeAmount}
              setStakeAmount={setStakeAmount}
            />

            <button
              disabled={stakeEnabled && (!selectedToken || !stakeAmount)}
              onClick={() => {
                if (stakeEnabled && selectedToken && stakeAmount) {
                  setStakeToken(selectedToken);
                  onStartGame({
                    staked: true,
                    token: selectedToken,
                    stakeAmount,
                  });
                  return;
                }
                onStartGame();
              }}
              className="group relative flex w-full items-center justify-center overflow-hidden rounded-full py-4 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="absolute inset-0 border border-white/20 rounded-full" />
              <div className="absolute inset-px rounded-full bg-linear-to-b from-white/10 to-transparent" />
              <span className="relative font-medium text-white">Start game</span>
              <div className="absolute bottom-0 h-px w-1/2 bg-white/50 blur-[2px]" />
            </button>
          </div>
        )}

        {gameMode === "online" && activeTab === "games" && <div className="py-10 text-center text-white/40">No active games</div>}
        {gameMode === "online" && activeTab === "players" && <div className="py-10 text-center text-white/40">No players online</div>}

        {gameMode === "friend" && activeTab === "new-game" && !selectedOpponent && (
          <div className="flex flex-col gap-6">
            <div className="w-full">
              <GlassBg className="" height={50}>
                <div className="flex items-center gap-2.5 rounded-full p-5">
                  <Image src="/icons/search-icon.svg" alt="search" width={18} height={18} />
                  <input
                    type="text"
                    placeholder="Search wallet address..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full bg-transparent text-xs text-white outline-none"
                  />
                </div>
              </GlassBg>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-white/60">Search Results</p>
                {searchResults.map(user => (
                  <button
                    key={user.id}
                    onClick={() => setSelectedOpponent(user)}
                    className="flex w-full items-center gap-3 rounded-2xl bg-white/5 p-3 text-left transition hover:bg-white/10"
                  >
                    <div className="relative h-10 w-10 flex items-center justify-center rounded-full bg-white/10 text-xs font-bold uppercase">
                      {user.walletAddress.slice(2, 4)}
                      <div className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#121212]",
                        onlineStatus[user.walletAddress] === "online" ? "bg-green-500" : "bg-gray-500"
                      )} />
                    </div>
                    <span className="text-sm text-white truncate">{user.walletAddress}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm text-white/60">Recent Opponents</p>
              {recentOpponents.length > 0 ? recentOpponents.map(opp => (
                <button
                  key={opp.id}
                  onClick={() => setSelectedOpponent(opp)}
                  className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-white/5"
                >
                  <div className="relative h-10 w-10 overflow-hidden rounded-full bg-white/10 flex items-center justify-center text-xs font-bold bg-linear-to-br from-white/10 to-white/5">
                    {opp.avatar ? (
                      <Image src={opp.avatar} alt={opp.walletAddress} width={40} height={40} className="object-cover" />
                    ) : (
                      opp.walletAddress.slice(2, 4).toUpperCase()
                    )}
                    <div className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#121212]",
                      onlineStatus[opp.walletAddress] === "online" ? "bg-green-500" : "bg-gray-500"
                    )} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm text-white">{opp.walletAddress.slice(0, 8)}...</span>
                    <span className="text-xs text-white/40">{onlineStatus[opp.walletAddress] || "offline"}</span>
                  </div>
                </button>
              )) : (
                <div className="py-4 text-center text-xs text-white/20 italic">No recent opponents found</div>
              )}
            </div>
          </div>
        )}

        {gameMode === "friend" && activeTab === "new-game" && selectedOpponent && (
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <button onClick={() => setSelectedOpponent(null)} className="absolute -left-12 top-0 mt-4 h-10 w-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10">
                <Image src="/icons/left-arrow.svg" alt="back" width={24} height={24} />
              </button>
              <div className="h-32 w-32 overflow-hidden rounded-full border-4 border-white/10 bg-red-400 flex items-center justify-center text-4xl font-bold uppercase">
                {selectedOpponent.avatar ? (
                  <Image src={selectedOpponent.avatar} alt="avatar" width={128} height={128} className="object-cover" />
                ) : (
                  selectedOpponent.walletAddress.slice(2, 4)
                )}
              </div>
            </div>

            <div className="text-center">
              <h3 className="text-lg font-medium text-white">{selectedOpponent.name || "Opponent"}</h3>
              <p className="text-xs text-white/40">{selectedOpponent.walletAddress}</p>
            </div>

            <div className="w-full">
              <SelectGameDuration timeControl={timeControl} setTimeControl={setTimeControl} />
            </div>

            <StakePanel
              stakeEnabled={stakeEnabled}
              setStakeEnabled={setStakeEnabled}
              selectedToken={selectedToken}
              setSelectedToken={setSelectedToken}
              stakeAmount={stakeAmount}
              setStakeAmount={setStakeAmount}
            />

            <GlassButton
              className="w-full"
              onClick={async () => {
                if (!socket || !userId) {
                  toast.error("Please connect your wallet first");
                  return;
                }
                if (stakeEnabled && selectedToken && stakeAmount) {
                  const decimals = (tokenDecimalsData as number) ?? 18;
                  const ok = await createGameSingle(selectedToken, stakeAmount, decimals);
                  if (!ok) return; // tx rejected or failed — don't send challenge
                  setStakeToken(selectedToken);
                }
                socket.emit("sendChallenge", {
                  toUserId: selectedOpponent.walletAddress,
                  fromUserId: userId,
                  stakeEnabled,
                  stakeToken: selectedToken,
                  stakeAmount,
                });
                toast.success(`Challenge sent to ${selectedOpponent.walletAddress.slice(0, 8)}...`);
              }}
            >
              {isStaking ? "Staking…" : "Send challenge"}
            </GlassButton>
          </div>
        )}
      </div>
    </div>
  );
}
