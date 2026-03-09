"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useAccount } from "wagmi";
import {
  getTournaments,
  getTournamentById,
  createTournament,
  joinTournament,
  exitTournament,
  canStartTournament,
  type TournamentListItem,
  type TournamentDetail,
} from "@/app/tournament-actions";
import { useSocket } from "@/hooks/useSocket";
import { useRouter } from "next/navigation";

export type TournamentStatus = "upcoming" | "in-progress" | "completed" | "cancelled";

// Map DB enum to UI status
const dbStatusToUI: Record<string, TournamentStatus> = {
  PENDING: "upcoming",
  READY: "upcoming",
  IN_PROGRESS: "in-progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

function formatFee(amount: number, token: string | null): string {
  if (amount === 0) return "Free";
  return `${amount} ${token ?? "ETH"}`;
}

function formatTime(minutes: number): string {
  return `${minutes} min`;
}

const statusColors: Record<TournamentStatus, string> = {
  upcoming:
    "relative text-blue-400 before:absolute before:bottom-0 before:left-0 before:w-1/2 before:h-1/2 before:border-b before:border-l before:border-blue-400/50 after:absolute after:top-0 after:right-0 after:w-1/2 after:h-1/2 after:border-t after:border-r after:border-blue-400/50",
  "in-progress":
    "relative text-green-400 before:absolute before:bottom-0 before:left-0 before:w-1/2 before:h-1/2 before:border-b before:border-l before:border-green-400/50 after:absolute after:top-0 after:right-0 after:w-1/2 after:h-1/2 after:border-t after:border-r after:border-green-400/50",
  completed:
    "relative text-white/40 before:absolute before:bottom-0 before:left-0 before:w-1/2 before:h-1/2 before:border-b before:border-l before:border-white/20 after:absolute after:top-0 after:right-0 after:w-1/2 after:h-1/2 after:border-t after:border-r after:border-white/20",
  cancelled:
    "relative text-red-400 before:absolute before:bottom-0 before:left-0 before:w-1/2 before:h-1/2 before:border-b before:border-l before:border-red-400/50 after:absolute after:top-0 after:right-0 after:w-1/2 after:h-1/2 after:border-t after:border-r after:border-red-400/50",
};

const statusLabels: Record<TournamentStatus, string> = {
  upcoming: "Upcoming",
  "in-progress": "Live",
  completed: "Completed",
  cancelled: "Cancelled",
};

type PanelView = "list" | "detail" | "create";
type FilterTab = "all" | TournamentStatus;

export function TournamentPanel() {
  const { address } = useAccount();
  const { socket } = useSocket(address ?? undefined);
  const router = useRouter();
  const [panelView, setPanelView] = useState<PanelView>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [canStart, setCanStart] = useState(false);

  // Data state
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Create form state
  const [name, setName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("3");
  const [timeControl, setTimeControl] = useState("10");
  const [entryFee, setEntryFee] = useState("");
  const [token, setToken] = useState("USDC");
  const [isSponsored, setIsSponsored] = useState(false);
  const [sponsorAmount, setSponsorAmount] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [joinAsPlayer, setJoinAsPlayer] = useState(true);

  // Fetch tournament list
  const fetchList = useCallback(() => {
    startTransition(async () => {
      const result = await getTournaments(
        filter === "all" ? "all" : filter === "upcoming" ? "upcoming" : filter === "in-progress" ? "in-progress" : filter === "completed" ? "completed" : "cancelled"
      );
      if (result.success) {
        setTournaments(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }, [filter]);

  const notifyTournamentListChanged = useCallback(() => {
    if (socket) {
      socket.emit("tournament:listChanged");
    }
  }, [socket]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!socket) return;

    const onTournamentListChanged = () => {
      fetchList();
    };

    socket.on("tournament:listChanged", onTournamentListChanged);
    return () => {
      socket.off("tournament:listChanged", onTournamentListChanged);
    };
  }, [socket, fetchList]);

  // Fetch detail when navigating
  const openDetail = useCallback((id: string) => {
    setSelectedId(id);
    setPanelView("detail");
    startTransition(async () => {
      const result = await getTournamentById(id);
      if (result.success) {
        setDetail(result.data);
        // Check if we can start this tournament
        if (address) {
          const startCheck = await canStartTournament(id, address);
          setCanStart(startCheck.success && startCheck.data?.canStart === true);
        }
      } else {
        setError(result.error);
      }
    });
  }, [address]);

  // Handlers
  const handleCreate = () => {
    startTransition(async () => {
      const result = await createTournament({
        walletAddress: address ?? "",
        name,
        maxPlayers: parseInt(maxPlayers) || 8,
        timeControl: parseInt(timeControl) || 10,
        entryFee: parseFloat(entryFee) || 0,
        token,
        isSponsored,
        sponsoredAmount: isSponsored ? parseFloat(sponsorAmount) || 0 : 0,
        startsAt: new Date(startsAt).toISOString(),
        joinAsPlayer,
      });
      if (result.success) {
        // Reset form & go back to list
        setName(""); setMaxPlayers("8"); setTimeControl("10"); setEntryFee("");
        setToken("USDC"); setIsSponsored(false); setSponsorAmount("");
        setStartsAt(""); setJoinAsPlayer(true);
        setPanelView("list");
        notifyTournamentListChanged();
        fetchList();
      } else {
        setError(result.error);
      }
    });
  };

  const handleJoin = (tournamentId: string) => {
    startTransition(async () => {
      const result = await joinTournament(tournamentId, address ?? "");
      if (result.success) {
        notifyTournamentListChanged();
        openDetail(tournamentId); // refresh detail
        fetchList(); // refresh counts
      } else {
        setError(result.error);
      }
    });
  };

  const handleExit = (tournamentId: string) => {
    startTransition(async () => {
      const result = await exitTournament(tournamentId, address ?? "");
      if (result.success) {
        notifyTournamentListChanged();
        openDetail(tournamentId);
        fetchList();
      } else {
        setError(result.error);
      }
    });
  };

  const filtered = tournaments;

  // ── LIST VIEW ──
  if (panelView === "list") {
    return (
      <div className="flex flex-col gap-4">
        {/* Error banner */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
          </div>
        )}

        {/* Filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "all", label: "All" },
              { id: "upcoming", label: "Upcoming" },
              { id: "in-progress", label: "Live" },
              { id: "completed", label: "Done" },
              { id: "cancelled", label: "Cancelled" },
            ] as { id: FilterTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                filter === tab.id
                  ? "border-white bg-white text-black"
                  : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tournament list */}
        <div className="elegant-scrollbar flex flex-col gap-2 max-h-[340px] overflow-y-auto pr-1">
          {isPending && filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-white/30">
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-white/30">
              No tournaments found
            </div>
          ) : (
            filtered.map((t) => {
              const uiStatus = dbStatusToUI[t.status] ?? "upcoming";
              return (
                <button
                  key={t.id}
                  onClick={() => openDetail(t.id)}
                  className="group flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-all hover:border-white/20 hover:bg-white/5 active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-white truncate">
                        {t.name}
                      </span>
                      {t.isSponsored && (
                        <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                          Sponsored
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        statusColors[uiStatus]
                      )}
                    >
                      {statusLabels[uiStatus]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-white/40">
                    <span>{formatFee(t.entryFee, t.token)}</span>
                    <span>·</span>
                    <span>
                      {t.playerCount}/{t.maxPlayers} players
                    </span>
                    <span>·</span>
                    <span>{formatTime(t.timeControl)}</span>
                    {t.token && (
                      <>
                        <span>·</span>
                        <span>{t.token}</span>
                      </>
                    )}
                  </div>
                  {uiStatus === "completed" && t.winner && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-amber-400">🏆</span>
                      <span className="text-amber-400/80 font-medium">
                        {t.winner.slice(0, 6)}...{t.winner.slice(-4)}
                      </span>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Create button */}
        <button
          onClick={() => setPanelView("create")}
          className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-full py-3.5 transition-transform active:scale-95"
        >
          <div className="absolute inset-0 border border-white/20 rounded-full" />
          <div className="absolute inset-px rounded-full bg-linear-to-b from-white/10 to-transparent" />
          <svg
            className="relative h-4 w-4 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="relative text-sm font-medium text-white">
            Create tournament
          </span>
          <div className="absolute bottom-0 h-px w-1/2 bg-white/50 blur-[2px]" />
        </button>
      </div>
    );
  }

  // ── DETAIL VIEW ──
  if (panelView === "detail") {
    if (!detail) {
      return (
        <div className="flex flex-col gap-4">
          <button
            onClick={() => setPanelView("list")}
            className="flex items-center gap-2 text-xs text-white/40 transition hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to tournaments
          </button>
          <div className="py-10 text-center text-sm text-white/30">Loading...</div>
        </div>
      );
    }
    const t = detail;
    const uiStatus = dbStatusToUI[t.status] ?? "upcoming";
    const isJoinable = uiStatus === "upcoming" && t.playerCount < t.maxPlayers;

    return (
      <div className="flex flex-col gap-4">
        {/* Error banner */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
          </div>
        )}

        {/* Back */}
        <button
          onClick={() => { setPanelView("list"); setDetail(null); }}
          className="flex items-center gap-2 text-xs text-white/40 transition hover:text-white"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to tournaments
        </button>

        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-white">{t.name}</h3>
            {t.isSponsored && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                Sponsored
              </span>
            )}
          </div>
          <p className="text-xs text-white/40">by {t.createdBy}</p>
        </div>

        {/* Info chips */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Entry", value: formatFee(t.entryFee, t.token) },
            { label: "Prize", value: formatFee(t.prizePool, t.token) },
            { label: "Players", value: `${t.playerCount}/${t.maxPlayers}` },
            { label: "Time", value: formatTime(t.timeControl) },
            ...(t.token ? [{ label: "Token", value: t.token }] : []),
            ...(t.isSponsored
              ? [
                  { label: "Sponsor Prize", value: formatFee(t.sponsoredAmount, t.token) },
                  { label: "Sponsor", value: t.sponsorAddress ?? "—" },
                ]
              : []),
          ].map((item) => (
            <div
              key={item.label}
              className="flex flex-col rounded-xl border border-white/10 bg-white/5 px-3 py-2"
            >
              <span className="text-[10px] text-white/40">{item.label}</span>
              <span className="text-xs font-medium text-white">
                {item.value}
              </span>
            </div>
          ))}
        </div>

        {/* Status / date */}
        <div className="flex items-center gap-2 text-xs text-white/40">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              statusColors[uiStatus]
            )}
          >
            {statusLabels[uiStatus]}
          </span>
          <span>
            {uiStatus === "completed"
              ? "Ended"
              : uiStatus === "in-progress"
                ? "Started"
                : uiStatus === "cancelled"
                  ? "Cancelled"
                  : "Starts"}{" "}
            {new Date(t.startsAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZoneName: "short",
            })}
          </span>
        </div>

        {/* Winner banner for completed tournaments */}
        {uiStatus === "completed" && (() => {
          const winner = t.participants.find((p) => p.placement === 1);
          if (!winner) return null;
          return (
            <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-amber-500/10 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 text-lg">
                  🏆
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-medium text-amber-400/70">Winner</span>
                  <span className="text-sm font-semibold text-amber-300">
                    {winner.walletAddress.slice(0, 6)}...{winner.walletAddress.slice(-4)}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Join / Exit buttons */}
        {(isJoinable || uiStatus === "upcoming") && (
          <div className="flex gap-2">
            {isJoinable && (
              <button
                onClick={() => handleJoin(t.id)}
                disabled={isPending}
                className="group relative flex flex-1 items-center justify-center overflow-hidden rounded-full py-3.5 transition-transform active:scale-95 disabled:opacity-50"
              >
                <div className="absolute inset-0 border border-white/20 rounded-full" />
                <div className="absolute inset-px rounded-full bg-linear-to-b from-white/10 to-transparent" />
                <span className="relative text-sm font-medium text-white">
                  {isPending ? "Joining..." : `Join${t.entryFee > 0 ? ` · ${formatFee(t.entryFee, t.token)}` : ""}`}
                </span>
                <div className="absolute bottom-0 h-px w-1/2 bg-white/50 blur-[2px]" />
              </button>
            )}
            <button
              onClick={() => handleExit(t.id)}
              disabled={isPending}
              className="flex flex-1 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 py-3 text-sm font-medium text-red-400 transition hover:bg-red-500/20 active:scale-95 disabled:opacity-50"
            >
              {isPending ? "Exiting..." : "Exit tournament"}
            </button>
          </div>
        )}

        {uiStatus === "upcoming" && !isJoinable && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs text-white/40 text-center">
            Tournament full
          </div>
        )}

        {/* Start Tournament — only shown to creator when tournament is ready */}
        {canStart && uiStatus === "upcoming" && (
          <button
            onClick={() => {
              if (socket) {
                socket.emit("tournament:start", { tournamentId: t.id });
              }
              router.push(`/play/tournament/${t.id}`);
            }}
            disabled={isPending}
            className="group relative flex w-full items-center justify-center overflow-hidden rounded-full py-3.5 transition-transform active:scale-95 disabled:opacity-50"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-blue-600 opacity-90 rounded-full" />
            <span className="relative text-sm font-bold text-white">
              Start Tournament
            </span>
          </button>
        )}

        {/* Enter Tournament — shown when tournament is in progress or ready */}
        {(uiStatus === "in-progress" || t.status === "READY") && (
          <button
            onClick={() => router.push(`/play/tournament/${t.id}`)}
            className="group relative flex w-full items-center justify-center overflow-hidden rounded-full py-3.5 transition-transform active:scale-95"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-blue-600 opacity-90 rounded-full" />
            <span className="relative text-sm font-bold text-white">
              Enter Tournament
            </span>
          </button>
        )}

        {/* Participants */}
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-medium text-white/60">
            {uiStatus === "completed" ? "Final Standings" : `Participants (${t.playerCount}/${t.maxPlayers})`}
          </h4>
          <div className="elegant-scrollbar flex flex-col gap-1 max-h-[160px] overflow-y-auto pr-1">
            {(uiStatus === "completed"
              ? [...t.participants].sort((a, b) => (a.placement ?? 999) - (b.placement ?? 999))
              : t.participants
            ).map((p, i) => (
              <div
                key={p.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2",
                  uiStatus === "completed" && p.placement === 1
                    ? "bg-amber-500/10 border border-amber-500/20"
                    : "bg-white/[0.02]",
                )}
              >
                <div className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
                  uiStatus === "completed" && p.placement === 1
                    ? "bg-amber-500/20 text-amber-400"
                    : uiStatus === "completed" && p.placement === 2
                      ? "bg-gray-400/20 text-gray-300"
                      : uiStatus === "completed" && p.placement === 3
                        ? "bg-orange-700/20 text-orange-400"
                        : "bg-white/10 text-white/60",
                )}>
                  {uiStatus === "completed" ? (p.placement ?? i + 1) : i + 1}
                </div>
                <span className={cn(
                  "text-xs",
                  uiStatus === "completed" && p.placement === 1
                    ? "text-amber-300 font-medium"
                    : "text-white/70",
                )}>
                  {p.walletAddress}
                </span>
              </div>
            ))}
            {t.playerCount < t.maxPlayers && (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-white/10 px-3 py-2 text-[10px] text-white/20">
                {t.maxPlayers - t.playerCount} spots remaining
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── CREATE VIEW ──
  return (
    <div className="flex flex-col gap-4">
      {/* Back */}
      <button
        onClick={() => setPanelView("list")}
        className="flex items-center gap-2 text-xs text-white/40 transition hover:text-white"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to tournaments
      </button>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      <h3 className="text-base font-semibold text-white">Create tournament</h3>

      {/* Name */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-white/60">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Weekend Blitz"
          maxLength={40}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 hover:bg-white/10 focus:border-white/20"
        />
      </div>

      {/* Number of players */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-white/60">Number of players (min 3)</label>
        <input
          type="text"
          inputMode="numeric"
          value={maxPlayers}
          onChange={(e) => {
            const val = e.target.value;
            if (/^\d*$/.test(val)) setMaxPlayers(val);
          }}
          placeholder="8"
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 hover:bg-white/10 focus:border-white/20"
        />
      </div>

      {/* Time control */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-white/60">Time control</label>
        <div className="relative">
          <select
            value={timeControl}
            onChange={(e) => setTimeControl(e.target.value)}
            className="w-full appearance-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition hover:bg-white/10 focus:border-white/20"
          >
            <option value="10" className="bg-[#0A0A0A]">10 min (Fast)</option>
            <option value="30" className="bg-[#0A0A0A]">30 min (Standard)</option>
            <option value="60" className="bg-[#0A0A0A]">60 min (Long)</option>
          </select>
          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/40">
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1.41 0.589996L6 5.17L10.59 0.589996L12 2L6 8L0 2L1.41 0.589996Z" fill="currentColor" />
            </svg>
          </div>
        </div>
      </div>

      {/* Token */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-white/60">Token</label>
        <div className="relative">
          <select
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full appearance-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition hover:bg-white/10 focus:border-white/20"
          >
            <option value="USDC" className="bg-[#0A0A0A]">USDC</option>
            <option value="WETH" className="bg-[#0A0A0A]">WETH</option>
            <option value="DAI" className="bg-[#0A0A0A]">DAI</option>
          </select>
          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/40">
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1.41 0.589996L6 5.17L10.59 0.589996L12 2L6 8L0 2L1.41 0.589996Z" fill="currentColor" />
            </svg>
          </div>
        </div>
      </div>

      {/* Entry fee */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-white/60">Entry fee ({token})</label>
        <input
          type="text"
          inputMode="decimal"
          value={entryFee}
          onChange={(e) => {
            const val = e.target.value;
            if (/^\d*\.?\d*$/.test(val)) setEntryFee(val);
          }}
          placeholder="0.00"
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 hover:bg-white/10 focus:border-white/20"
        />
      </div>

      {/* Start time */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-white/60">Start time</label>
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition hover:bg-white/10 focus:border-white/20 [color-scheme:dark]"
        />
      </div>

      {/* Sponsored toggle */}
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-white">Sponsored tournament</span>
          <span className="text-[10px] text-white/40">Add extra prize pool from your wallet</span>
        </div>
        <button
          onClick={() => setIsSponsored(!isSponsored)}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors",
            isSponsored ? "bg-amber-500" : "bg-white/20"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform",
              isSponsored && "translate-x-5"
            )}
          />
        </button>
      </div>

      {/* Sponsored amount */}
      {isSponsored && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-white/60">Sponsor prize ({token})</label>
          <input
            type="text"
            inputMode="decimal"
            value={sponsorAmount}
            onChange={(e) => {
              const val = e.target.value;
              if (/^\d*\.?\d*$/.test(val)) setSponsorAmount(val);
            }}
            placeholder="0.00"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 hover:bg-white/10 focus:border-white/20"
          />
        </div>
      )}

      {/* Join as player toggle — only relevant for sponsored tournaments */}
      {isSponsored && (
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">Join as player</span>
            <span className="text-[10px] text-white/40">Participate in the tournament you create</span>
          </div>
          <button
            onClick={() => setJoinAsPlayer(!joinAsPlayer)}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors",
              joinAsPlayer ? "bg-white" : "bg-white/20"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 h-5 w-5 rounded-full transition-transform",
                joinAsPlayer ? "translate-x-5 bg-black" : "bg-white"
              )}
            />
          </button>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleCreate}
        disabled={isPending}
        className="group relative mt-1 flex w-full items-center justify-center overflow-hidden rounded-full py-3.5 transition-transform active:scale-95 disabled:opacity-50"
      >
        <div className="absolute inset-0 border border-white/20 rounded-full" />
        <div className="absolute inset-px rounded-full bg-linear-to-b from-white/10 to-transparent" />
        <span className="relative text-sm font-medium text-white">
          {isPending ? "Creating..." : "Create tournament"}
        </span>
        <div className="absolute bottom-0 h-px w-1/2 bg-white/50 blur-[2px]" />
      </button>
    </div>
  );
}
