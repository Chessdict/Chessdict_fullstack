"use client";

import { useEffect, useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { useReadContracts } from "wagmi";
import { useRouter } from "next/navigation";
import { getStakedGameHistory } from "@/app/actions";
import { useChessdict, type GameSingle } from "@/hooks/useChessdict";
import {
  chessdictAbi,
  CHESSDICT_ADDRESS,
  CHESSDICT_CHAIN_ID,
} from "@/lib/contract";
import { formatUnits } from "viem";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Trophy,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

type StakedGame = {
  id: string;
  onChainGameId: string;
  stakeToken: string;
  wagerAmount: number;
  result: "win" | "loss" | "draw";
  playedAs: "white" | "black";
  opponentAddress: string;
  date: string;
};

type ClaimStatus = "claimable" | "claimed" | "settlement_pending" | "lost";

type Filter = "all" | "claimable" | "claimed" | "pending";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

function deriveClaimStatus(
  onChainGame: GameSingle | undefined,
  userAddress: string,
  result: "win" | "loss" | "draw",
): ClaimStatus {
  if (!onChainGame) return "settlement_pending";

  const winner = onChainGame.winner.toLowerCase();

  // No winner set => settlement hasn't happened
  if (winner === ZERO_ADDRESS) {
    return "settlement_pending";
  }

  // Prize already distributed
  if (onChainGame.totalPrize === BigInt(0)) {
    return result === "loss" ? "lost" : "claimed";
  }

  // Draw => both players can claim refund
  if (winner === DEAD_ADDRESS) {
    return "claimable";
  }

  // Winner matches current user
  if (winner === userAddress.toLowerCase()) {
    return "claimable";
  }

  // Opponent won, prize not yet claimed by them
  return "lost";
}

const statusConfig = {
  claimable: { label: "Claimable", color: "bg-green-500/20 text-green-400 border-green-500/20", icon: Trophy },
  claimed: { label: "Claimed", color: "bg-white/10 text-white/40 border-white/10", icon: CheckCircle2 },
  settlement_pending: { label: "Pending", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/20", icon: Clock },
  lost: { label: "You Lost", color: "bg-red-500/20 text-red-400 border-red-500/20", icon: AlertTriangle },
};

const resultLabel = { win: "W", loss: "L", draw: "D" };

export default function ClaimsPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const { claimPrizeSingle, isLoading: claimLoading } = useChessdict();

  const [games, setGames] = useState<StakedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected || !address) {
      router.push("/");
    }
  }, [isConnected, address, router]);

  // Fetch staked games from DB
  useEffect(() => {
    if (!address) return;

    async function fetchGames() {
      setLoading(true);
      const res = await getStakedGameHistory(address!, page);
      if (res.success && res.games) {
        setGames(res.games);
        setTotalPages(res.totalPages ?? 0);
      }
      setLoading(false);
    }

    fetchGames();
  }, [address, page]);

  // Batch-read on-chain state for all games
  const contracts = useMemo(
    () =>
      games.map((g) => ({
        address: CHESSDICT_ADDRESS,
        abi: chessdictAbi,
        functionName: "getGameSingle" as const,
        args: [BigInt(g.onChainGameId)] as const,
        chainId: CHESSDICT_CHAIN_ID,
      })),
    [games],
  );

  const {
    data: onChainResults,
    isLoading: chainLoading,
    refetch: refetchOnChain,
  } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 },
  });

  // Batch-read token decimals for unique tokens
  const uniqueTokens = useMemo(() => {
    const tokens = new Set(games.map((g) => g.stakeToken).filter(Boolean));
    return Array.from(tokens);
  }, [games]);

  const decimalsContracts = useMemo(
    () =>
      uniqueTokens.map((token) => ({
        address: token as `0x${string}`,
        abi: [{ type: "function" as const, name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" as const }] as const,
        functionName: "decimals" as const,
        chainId: CHESSDICT_CHAIN_ID,
      })),
    [uniqueTokens],
  );

  const symbolContracts = useMemo(
    () =>
      uniqueTokens.map((token) => ({
        address: token as `0x${string}`,
        abi: [{ type: "function" as const, name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" as const }] as const,
        functionName: "symbol" as const,
        chainId: CHESSDICT_CHAIN_ID,
      })),
    [uniqueTokens],
  );

  const { data: decimalsResults } = useReadContracts({
    contracts: decimalsContracts,
    query: { enabled: decimalsContracts.length > 0 },
  });

  const { data: symbolResults } = useReadContracts({
    contracts: symbolContracts,
    query: { enabled: symbolContracts.length > 0 },
  });

  const tokenInfo = useMemo(() => {
    const map: Record<string, { decimals: number; symbol: string }> = {};
    uniqueTokens.forEach((token, i) => {
      const decimals = decimalsResults?.[i]?.result as number | undefined;
      const symbol = symbolResults?.[i]?.result as string | undefined;
      map[token.toLowerCase()] = {
        decimals: decimals ?? 18,
        symbol: symbol ?? "TOKEN",
      };
    });
    return map;
  }, [uniqueTokens, decimalsResults, symbolResults]);

  // Combine DB + on-chain data
  const enrichedGames = useMemo(() => {
    if (!address) return [];
    return games.map((game, i) => {
      const onChainData = onChainResults?.[i]?.result as GameSingle | undefined;
      const status = deriveClaimStatus(onChainData, address, game.result);
      const info = tokenInfo[game.stakeToken.toLowerCase()];
      const totalPrize = onChainData?.totalPrize;
      let prizeDisplay = `${game.wagerAmount * 2}`;
      if (totalPrize !== undefined && totalPrize > BigInt(0) && info) {
        prizeDisplay = formatUnits(totalPrize, info.decimals);
      }
      return {
        ...game,
        claimStatus: status,
        prizeDisplay,
        tokenSymbol: info?.symbol ?? "TOKEN",
      };
    });
  }, [games, onChainResults, address, tokenInfo]);

  // Filter
  const filteredGames = useMemo(() => {
    if (filter === "all") return enrichedGames;
    if (filter === "claimable") return enrichedGames.filter((g) => g.claimStatus === "claimable");
    if (filter === "claimed") return enrichedGames.filter((g) => g.claimStatus === "claimed");
    if (filter === "pending") return enrichedGames.filter((g) => g.claimStatus === "settlement_pending");
    return enrichedGames;
  }, [enrichedGames, filter]);

  // Stats
  const stats = useMemo(() => {
    const claimable = enrichedGames.filter((g) => g.claimStatus === "claimable").length;
    const claimed = enrichedGames.filter((g) => g.claimStatus === "claimed").length;
    const pending = enrichedGames.filter((g) => g.claimStatus === "settlement_pending").length;
    return { total: enrichedGames.length, claimable, claimed, pending };
  }, [enrichedGames]);

  async function handleClaim(onChainGameId: string) {
    setClaimingId(onChainGameId);
    try {
      await claimPrizeSingle(BigInt(onChainGameId));
      await refetchOnChain();
    } catch {
      // useChessdict already handles error toasts
    } finally {
      setClaimingId(null);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    const res = await getStakedGameHistory(address!, page);
    if (res.success && res.games) {
      setGames(res.games);
      setTotalPages(res.totalPages ?? 0);
    }
    await refetchOnChain();
    setRefreshing(false);
  }

  const isDataLoading = loading || chainLoading;

  if (!isConnected || !address) return null;

  if (isDataLoading && games.length === 0) {
    return (
      <main className="flex min-h-screen flex-col bg-black text-white selection:bg-white/20">
        <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black pointer-events-none" />
        <div className="container relative mx-auto flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-black text-white selection:bg-white/20">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black pointer-events-none" />

      <div className="container relative mx-auto flex flex-1 flex-col gap-6 px-3 pt-20 pb-6 sm:px-6 sm:pt-32 sm:gap-8 max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold">Claim History</h1>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Claimable" value={stats.claimable} color="text-green-400" />
          <StatCard label="Claimed" value={stats.claimed} color="text-white/40" />
          <StatCard label="Pending" value={stats.pending} color="text-yellow-400" />
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {(["all", "claimable", "claimed", "pending"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition border ${
                filter === f
                  ? "bg-white/10 text-white border-white/20"
                  : "bg-transparent text-white/40 border-white/5 hover:border-white/10 hover:text-white/60"
              }`}
            >
              {f === "all" ? "All" : f === "claimable" ? "Claimable" : f === "claimed" ? "Claimed" : "Pending"}
            </button>
          ))}
        </div>

        {/* Game List */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6">
          {filteredGames.length === 0 ? (
            <p className="text-sm text-white/30 text-center py-6">
              {filter === "all" ? "No staked games found." : `No ${filter} games.`}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredGames.map((game) => {
                const cfg = statusConfig[game.claimStatus];
                const StatusIcon = cfg.icon;
                const isClaiming = claimingId === game.onChainGameId;

                return (
                  <div
                    key={game.id}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Result badge */}
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          game.result === "win"
                            ? "bg-green-500/20 text-green-400"
                            : game.result === "loss"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {resultLabel[game.result]}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-mono text-white/80 truncate">
                          {game.opponentAddress.slice(0, 6)}...{game.opponentAddress.slice(-4)}
                        </p>
                        <p className="text-xs text-white/30">
                          {game.prizeDisplay} {game.tokenSymbol} &middot;{" "}
                          {new Date(game.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Status badge */}
                      <span className={`hidden sm:flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border ${cfg.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {cfg.label}
                      </span>

                      {/* Claim button */}
                      {game.claimStatus === "claimable" && (
                        <button
                          onClick={() => handleClaim(game.onChainGameId)}
                          disabled={isClaiming || claimLoading}
                          className="rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-1.5 text-xs font-bold text-white transition-transform active:scale-95 disabled:opacity-50"
                        >
                          {isClaiming ? (
                            <span className="flex items-center gap-1.5">
                              <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Claiming
                            </span>
                          ) : (
                            "Claim"
                          )}
                        </button>
                      )}

                      {game.claimStatus === "settlement_pending" && (
                        <span className="sm:hidden flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border bg-yellow-500/20 text-yellow-400 border-yellow-500/20">
                          <Clock className="h-3 w-3" />
                          Pending
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <span className="text-xs text-white/40 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Info note for pending settlements */}
        {stats.pending > 0 && (
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
            <p className="text-xs text-yellow-400/80">
              <strong>Note:</strong> {stats.pending} game{stats.pending > 1 ? "s have" : " has"} pending settlement.
              This means the server hasn&apos;t confirmed the result on-chain yet. Your funds are safe &mdash; prizes will become claimable once settlement completes. Contact support if this persists.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-4 text-center">
      <p className="text-xs uppercase tracking-widest text-white/40 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color ?? "text-white"}`}>{value}</p>
    </div>
  );
}
