"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { getUserProfile, getGameHistory } from "@/app/actions";
import { Copy, Check, Trophy, Target, Minus, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";

type Profile = {
    walletAddress: string;
    rating: number;
    joinedAt: string;
    totalGames: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
};

type GameRecord = {
    id: string;
    result: "win" | "loss" | "draw";
    playedAs: "white" | "black";
    opponentAddress: string;
    opponentRating: number;
    date: string;
};

export default function ProfilePage() {
    const { address, isConnected } = useAccount();
    const router = useRouter();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [games, setGames] = useState<GameRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [gamesLoading, setGamesLoading] = useState(false);

    useEffect(() => {
        if (!isConnected || !address) {
            router.push("/");
            return;
        }

        async function fetchData() {
            setLoading(true);
            const [profileRes, historyRes] = await Promise.all([
                getUserProfile(address!),
                getGameHistory(address!, 1),
            ]);

            if (profileRes.success && profileRes.profile) {
                setProfile(profileRes.profile);
            }
            if (historyRes.success && historyRes.games) {
                setGames(historyRes.games);
                setTotalPages(historyRes.totalPages ?? 0);
            }
            setLoading(false);
        }

        fetchData();
    }, [address, isConnected, router]);

    useEffect(() => {
        if (!address || page === 1) return;

        async function fetchPage() {
            setGamesLoading(true);
            const res = await getGameHistory(address!, page);
            if (res.success && res.games) {
                setGames(res.games);
                setTotalPages(res.totalPages ?? 0);
            }
            setGamesLoading(false);
        }

        fetchPage();
    }, [address, page]);

    function copyAddress() {
        if (!address) return;
        navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    if (loading) {
        return (
            <main className="flex min-h-screen flex-col bg-black text-white selection:bg-white/20">
                <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black pointer-events-none" />
                <div className="container relative mx-auto flex flex-1 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                </div>
            </main>
        );
    }

    if (!profile) {
        return (
            <main className="flex min-h-screen flex-col bg-black text-white selection:bg-white/20">
                <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black pointer-events-none" />
                <div className="container relative mx-auto flex flex-1 items-center justify-center">
                    <p className="text-white/50">Profile not found.</p>
                </div>
            </main>
        );
    }

    const resultLabel = { win: "W", loss: "L", draw: "D" };

    return (
        <main className="flex min-h-screen flex-col bg-black text-white selection:bg-white/20">
            <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black pointer-events-none" />

            <div className="container relative mx-auto flex flex-1 flex-col gap-6 px-3 pb-6 sm:px-6 sm:gap-8 max-w-2xl">
                {/* Wallet Address */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6">
                    <p className="text-xs uppercase tracking-widest text-white/40 mb-3">Wallet Address</p>
                    <div className="flex items-center gap-3">
                        <code className="text-lg sm:text-xl font-mono text-white/90 break-all">
                            {profile.walletAddress}
                        </code>
                        <button
                            onClick={copyAddress}
                            className="shrink-0 rounded-lg border border-white/10 p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
                        >
                            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                        </button>
                    </div>
                    <p className="mt-3 text-xs text-white/30">
                        Joined {new Date(profile.joinedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                    </p>
                </div>

                {/* ELO Rating */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 text-center">
                    <p className="text-xs uppercase tracking-widest text-white/40 mb-2">ELO Rating</p>
                    <p className="text-5xl font-bold tabular-nums">{profile.rating}</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard icon={<Target className="h-4 w-4" />} label="Games" value={profile.totalGames} />
                    <StatCard icon={<Trophy className="h-4 w-4 text-green-400" />} label="Wins" value={profile.wins} />
                    <StatCard icon={<Minus className="h-4 w-4 text-red-400" />} label="Losses" value={profile.losses} />
                    <StatCard icon={<TrendingUp className="h-4 w-4 text-yellow-400" />} label="Win Rate" value={`${profile.winRate}%`} />
                </div>

                {/* Recent Games */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6">
                    <p className="text-xs uppercase tracking-widest text-white/40 mb-4">Recent Games</p>
                    {games.length === 0 && !gamesLoading ? (
                        <p className="text-sm text-white/30 text-center py-6">No games played yet.</p>
                    ) : gamesLoading ? (
                        <div className="flex justify-center py-8">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {games.map((game) => (
                                <div
                                    key={game.id}
                                    className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
                                >
                                    <div className="flex items-center gap-3">
                                        <span
                                            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${game.result === "win"
                                                ? "bg-green-500/20 text-green-400"
                                                : game.result === "loss"
                                                    ? "bg-red-500/20 text-red-400"
                                                    : "bg-yellow-500/20 text-yellow-400"
                                                }`}
                                        >
                                            {resultLabel[game.result]}
                                        </span>
                                        <div>
                                            <p className="text-sm font-mono text-white/80">
                                                {game.opponentAddress.slice(0, 6)}...{game.opponentAddress.slice(-4)}
                                            </p>
                                            <p className="text-xs text-white/30">
                                                {game.playedAs === "white" ? "White" : "Black"} &middot; Opp. {game.opponentRating}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-white/30">
                                        {new Date(game.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

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
            </div>
        </main>
    );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-white/40 mb-1">
                {icon}
                <p className="text-xs uppercase tracking-widest">{label}</p>
            </div>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
        </div>
    );
}
