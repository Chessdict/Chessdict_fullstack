"use client";

import { useEffect, useState } from "react";
import { formatGameReason } from "@/lib/game-result-display";
import { useTournamentStore, type Standing } from "@/stores/tournament-store";
import { cn } from "@/lib/utils";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function useCountdown(targetTime: number | null): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!targetTime) {
      setRemaining(0);
      return;
    }
    const update = () => setRemaining(Math.max(0, targetTime - Date.now()));
    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [targetTime]);

  return remaining;
}

function StandingsTable({
  standings,
  myAddress,
}: {
  standings: Standing[];
  myAddress?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="grid grid-cols-[40px_1fr_60px_48px_48px_48px] gap-1 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5">
        <span>#</span>
        <span>Player</span>
        <span className="text-center">Pts</span>
        <span className="text-center">W</span>
        <span className="text-center">D</span>
        <span className="text-center">L</span>
      </div>
      <div className="max-h-[240px] overflow-y-auto">
        {standings.map((s) => {
          const isMe = s.walletAddress === myAddress;
          return (
            <div
              key={s.walletAddress}
              className={cn(
                "grid grid-cols-[40px_1fr_60px_48px_48px_48px] gap-1 px-3 py-2 text-sm border-b border-white/5 last:border-0",
                isMe
                  ? "bg-blue-500/10 border-blue-500/20"
                  : "hover:bg-white/5",
              )}
            >
              <span
                className={cn(
                  "font-mono font-bold",
                  s.rank === 1
                    ? "text-yellow-400"
                    : s.rank === 2
                      ? "text-gray-300"
                      : s.rank === 3
                        ? "text-amber-600"
                        : "text-white/40",
                )}
              >
                {s.rank}
              </span>
              <span
                className={cn(
                  "truncate font-medium",
                  isMe ? "text-blue-400" : "text-white",
                )}
              >
                {isMe
                  ? "You"
                  : `${s.walletAddress.slice(0, 6)}...${s.walletAddress.slice(-4)}`}
              </span>
              <span className="text-center font-mono font-bold text-white">
                {s.points % 1 === 0 ? s.points : s.points.toFixed(1)}
              </span>
              <span className="text-center font-mono text-green-400">
                {s.wins}
              </span>
              <span className="text-center font-mono text-white/40">
                {s.draws}
              </span>
              <span className="text-center font-mono text-red-400">
                {s.losses}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DisconnectedPlayersBanner({ disconnectedPlayers }: { disconnectedPlayers: Record<string, number> }) {
  const entries = Object.entries(disconnectedPlayers);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (entries.length === 0) return;
    const interval = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(interval);
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {entries.map(([wallet, deadline]) => {
        const secs = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        return (
          <div
            key={wallet}
            className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2"
          >
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-xs text-amber-300 truncate flex-1">
              {`${wallet.slice(0, 6)}...${wallet.slice(-4)}`}
              <span className="text-amber-400/60"> disconnected</span>
            </span>
            <span className="font-mono text-xs font-bold text-amber-400 tabular-nums">
              {secs}s
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TournamentLobby({ myAddress }: { myAddress?: string }) {
  const {
    phase,
    currentRound,
    totalRounds,
    timeControl,
    standings,
    participants,
    roundEndTime,
    breakEndTime,
    startingEndTime,
    isFinalBreak,
    gamesCompleted,
    totalGames,
    opponentAddress,
    gameResult,
    disconnectedPlayers,
  } = useTournamentStore();

  const startingRemaining = useCountdown(startingEndTime);
  const roundRemaining = useCountdown(roundEndTime);
  const breakRemaining = useCountdown(breakEndTime);

  // ── Lobby: waiting for tournament to begin ──
  if (phase === "lobby") {
    const connectedCount = participants.filter((p) => p.connected).length;
    return (
      <div className="mt-[50px] flex flex-col gap-4 rounded-[32px] border border-white/10 bg-[#0A0A0A]/40 p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <span className="text-xs font-bold uppercase tracking-widest text-white/40">
            Tournament Lobby
          </span>
          <span className="text-xs text-white/30">
            Round-Robin &middot; {timeControl} min
          </span>
        </div>

        <div className="flex flex-col items-center gap-4 py-6">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-white/10 border-t-blue-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 rounded-full bg-blue-500/20" />
            </div>
          </div>
          <p className="text-white font-medium">Waiting for tournament to start...</p>
          <p className="text-sm text-white/40">
            {connectedCount}/{participants.length} players connected
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">
            Players
          </h3>
          <div className="space-y-1">
            {participants.map((p) => (
              <div
                key={p.walletAddress}
                className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2"
              >
                <div
                  className={cn(
                    "h-2 w-2 rounded-full",
                    p.connected ? "bg-green-500" : "bg-white/20",
                  )}
                />
                <span
                  className={cn(
                    "text-sm",
                    p.walletAddress === myAddress
                      ? "font-medium text-blue-400"
                      : "text-white/70",
                  )}
                >
                  {p.walletAddress === myAddress
                    ? "You"
                    : `${p.walletAddress.slice(0, 6)}...${p.walletAddress.slice(-4)}`}
                </span>
                <span className="ml-auto text-[10px] text-white/30">
                  {p.connected ? "Ready" : "Connecting..."}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Starting: countdown before first round ──
  if (phase === "starting") {
    const secs = Math.ceil(startingRemaining / 1000);
    return (
      <div className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-[#0A0A0A]/40 p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <span className="text-xs font-bold uppercase tracking-widest text-white/40">
            Tournament Starting
          </span>
          <span className="text-xs text-white/30">{totalRounds} rounds</span>
        </div>

        <div className="flex flex-col items-center gap-4 py-8">
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-4 border-green-500/30 bg-green-500/10">
            <span className="text-5xl font-bold tabular-nums text-green-400">
              {secs}
            </span>
          </div>
          <p className="text-white font-medium">Tournament begins in...</p>
          <p className="text-sm text-white/40">
            {participants.length} players &middot; {totalRounds} rounds
            &middot; {timeControl} min per game
          </p>
        </div>

        {standings.length > 0 && (
          <StandingsTable standings={standings} myAddress={myAddress} />
        )}
      </div>
    );
  }

  // ── Bye: player has bye this round ──
  if (phase === "bye") {
    return (
      <div className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-[#0A0A0A]/40 p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <span className="text-xs font-bold uppercase tracking-widest text-white/40">
            Round {currentRound} of {totalRounds}
          </span>
          <span className="text-xs text-green-400">+1 point (bye)</span>
        </div>

        <div className="flex flex-col items-center gap-4 py-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-yellow-500/10 border border-yellow-500/20">
            <svg
              className="h-10 w-10 text-yellow-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </div>
          <p className="text-white font-medium">You have a bye this round</p>
          <p className="text-sm text-white/40">
            Sit back and watch! You receive 1 point automatically.
          </p>
        </div>

        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Round ends in</span>
            <span className="font-mono font-bold text-white tabular-nums">
              {formatCountdown(roundRemaining)}
            </span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{
                width: `${roundEndTime ? Math.max(0, ((roundEndTime - Date.now()) / (timeControl * 60 * 1000)) * 100) : 0}%`,
              }}
            />
          </div>
        </div>

        <div className="text-center text-xs text-white/30">
          {gamesCompleted}/{totalGames} games completed
        </div>

        <StandingsTable standings={standings} myAddress={myAddress} />
      </div>
    );
  }

  // ── Round Waiting: game ended, waiting for other games ──
  if (phase === "round-waiting") {
    return (
      <div className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-[#0A0A0A]/40 p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <span className="text-xs font-bold uppercase tracking-widest text-white/40">
            Round {currentRound} of {totalRounds}
          </span>
          <span className="text-xs text-white/30">Waiting for others</span>
        </div>

        {/* Game result */}
        {gameResult && (
          <div
            className={cn(
              "rounded-xl border p-4 text-center",
              gameResult.winner === "draw"
                ? "border-yellow-500/20 bg-yellow-500/10"
                : "border-green-500/20 bg-green-500/10",
            )}
          >
            <p className="text-lg font-bold text-white">
              {gameResult.winner === "draw"
                ? "Draw! (+0.5)"
                : `You ${
                    (gameResult.winner === "white" &&
                      useTournamentStore.getState().playerColor === "white") ||
                    (gameResult.winner === "black" &&
                      useTournamentStore.getState().playerColor === "black")
                      ? "Won! (+1)"
                      : "Lost (+0)"
                  }`}
            </p>
            {gameResult.reason && (
              <p className="text-xs text-white/40 mt-1 capitalize">
                {formatGameReason(gameResult.reason)}
              </p>
            )}
          </div>
        )}

        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/60">
              Waiting for other games to finish...
            </span>
            <span className="text-xs text-white/30">
              {gamesCompleted}/{totalGames}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Round ends in</span>
            <span className="font-mono font-bold text-white tabular-nums text-lg">
              {formatCountdown(roundRemaining)}
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{
                width: `${roundEndTime ? Math.max(0, ((roundEndTime - Date.now()) / (timeControl * 60 * 1000)) * 100) : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Disconnected players */}
        <DisconnectedPlayersBanner disconnectedPlayers={disconnectedPlayers} />

        <StandingsTable standings={standings} myAddress={myAddress} />
      </div>
    );
  }

  // ── Break: countdown between rounds ──
  if (phase === "break") {
    const breakSecs = Math.ceil(breakRemaining / 1000);
    const isLast = isFinalBreak;
    return (
      <div className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-[#0A0A0A]/40 p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <span className="text-xs font-bold uppercase tracking-widest text-white/40">
            {isLast ? "Final Results Loading" : `Next: Round ${currentRound + 1}`}
          </span>
          <span className="text-xs text-white/30">
            Round {currentRound}/{totalRounds} complete
          </span>
        </div>

        <div className="flex flex-col items-center gap-3 py-6">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-4 border-purple-500/30 bg-purple-500/10">
            <span className="text-4xl font-bold tabular-nums text-purple-400">
              {breakSecs}
            </span>
          </div>
          <p className="text-white font-medium">
            {isLast
              ? "Calculating final results..."
              : `Round ${currentRound + 1} starting in...`}
          </p>
          <p className="text-xs text-white/40">Get ready!</p>
        </div>

        <StandingsTable standings={standings} myAddress={myAddress} />
      </div>
    );
  }

  // ── Complete: tournament finished ──
  if (phase === "complete") {
    const winner = standings[0];
    const isWinner = winner?.walletAddress === myAddress;
    const myStanding = standings.find((s) => s.walletAddress === myAddress);

    return (
      <div className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-[#0A0A0A]/40 p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <span className="text-xs font-bold uppercase tracking-widest text-yellow-400">
            Tournament Complete
          </span>
          <span className="text-xs text-white/30">
            {totalRounds} rounds played
          </span>
        </div>

        <div className="flex flex-col items-center gap-4 py-4">
          {/* Trophy */}
          <div className="relative">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-yellow-500/20 to-amber-600/20 border border-yellow-500/30">
              <svg
                className="h-12 w-12 text-yellow-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </div>
          </div>

          <div className="text-center">
            <p className="text-xl font-bold text-white">
              {isWinner ? "You Won!" : "Tournament Over"}
            </p>
            {winner && (
              <p className="text-sm text-yellow-400 mt-1">
                Winner:{" "}
                {isWinner
                  ? "You"
                  : `${winner.walletAddress.slice(0, 6)}...${winner.walletAddress.slice(-4)}`}{" "}
                ({winner.points} pts)
              </p>
            )}
            {myStanding && !isWinner && (
              <p className="text-xs text-white/40 mt-1">
                Your placement: #{myStanding.rank} ({myStanding.points} pts)
              </p>
            )}
          </div>
        </div>

        <StandingsTable standings={standings} myAddress={myAddress} />

        <a
          href="/play"
          className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          Back to Play
        </a>
      </div>
    );
  }

  // ── Playing: show mini standings panel alongside the board ──
  return (
    <div className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-[#0A0A0A]/40 p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <span className="text-xs font-bold uppercase tracking-widest text-white/40">
          Round {currentRound} of {totalRounds}
        </span>
        <span className="text-xs text-green-400 animate-pulse">Live</span>
      </div>

      {/* Opponent info */}
      {opponentAddress && (
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-red-500/20 to-transparent border border-white/10 flex items-center justify-center">
            <span className="text-xs font-bold text-white/60 uppercase">
              {opponentAddress.slice(2, 4)}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              vs{" "}
              {`${opponentAddress.slice(0, 6)}...${opponentAddress.slice(-4)}`}
            </p>
            <p className="text-xs text-white/40">
              Round {currentRound} &middot; {timeControl} min
            </p>
          </div>
        </div>
      )}

      {/* Round progress */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/40">Round timer</span>
          <span className="font-mono font-bold text-white tabular-nums">
            {formatCountdown(roundRemaining)}
          </span>
        </div>
        <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{
              width: `${roundEndTime ? Math.max(0, ((roundEndTime - Date.now()) / (timeControl * 60 * 1000)) * 100) : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Disconnected players */}
      <DisconnectedPlayersBanner disconnectedPlayers={disconnectedPlayers} />

      <StandingsTable standings={standings} myAddress={myAddress} />
    </div>
  );
}
