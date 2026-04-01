"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getUserProfile, getGameHistory, updateEmail, updateUsername } from "@/app/actions";
import { Copy, Check, Trophy, Target, Minus, TrendingUp, ChevronLeft, ChevronRight, Share2 } from "lucide-react";
import { getMemojiForAddress } from "@/lib/memoji";
import { getTimeControlDisplay } from "@/lib/time-control";
import { formatWalletAddress, getDisplayName } from "@/lib/utils";
import { toast } from "sonner";

type Profile = {
    walletAddress: string;
    username?: string | null;
    email?: string | null;
    ratings: {
        bullet: number;
        blitz: number;
        rapid: number;
        staked: number;
    };
    joinedAt: string;
    totalGames: number;
    wins: number;
    losses: number;
    draws: number;
    totalStakedAmount: number;
    winRate: number;
};

type GameRecord = {
    id: string;
    result: "win" | "loss" | "draw";
    playedAs: "white" | "black";
    opponentAddress: string;
    opponentUsername?: string | null;
    opponentRating: number;
    timeControl: number;
    isStaked: boolean;
    onChainGameId: string | null;
    stakeToken: string | null;
    wagerAmount: number | null;
    date: string;
};

export default function ProfilePage() {
    const { address, isConnected } = useAccount();
    const router = useRouter();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [games, setGames] = useState<GameRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);
    const [usernameDraft, setUsernameDraft] = useState("");
    const [emailDraft, setEmailDraft] = useState("");
    const [savingUsername, setSavingUsername] = useState(false);
    const [savingEmail, setSavingEmail] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [gamesLoading, setGamesLoading] = useState(false);

    function formatStakeAmount(amount: number) {
        const formatted = new Intl.NumberFormat("en-US", {
            maximumFractionDigits: 2,
        }).format(amount);
        return `${formatted} USD`;
    }

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
                setUsernameDraft(profileRes.profile.username ?? "");
                setEmailDraft(profileRes.profile.email ?? "");
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
    const profileMemoji = getMemojiForAddress(profile.walletAddress);
    const displayName = getDisplayName(profile.username, profile.walletAddress, "Player");
    const publicProfileIdentifier = profile.username || profile.walletAddress;
    const publicProfilePath = `/player/${encodeURIComponent(publicProfileIdentifier)}`;
    const publicProfileUrl =
        typeof window === "undefined"
            ? publicProfilePath
            : `${window.location.origin}${publicProfilePath}`;

    async function copyTextWithFallback(value: string) {
        try {
            await navigator.clipboard.writeText(value);
            return true;
        } catch {
            const textarea = document.createElement("textarea");
            textarea.value = value;
            textarea.setAttribute("readonly", "");
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            const copied = document.execCommand("copy");
            document.body.removeChild(textarea);
            return copied;
        }
    }

    async function shareProfile() {
        if (typeof window === "undefined") return;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: `${displayName} on Chessdict`,
                    text: `View ${displayName}'s Chessdict profile`,
                    url: publicProfileUrl,
                });
                return;
            } catch (error) {
                if ((error as Error)?.name === "AbortError") {
                    return;
                }
            }
        }

        const copied = await copyTextWithFallback(publicProfileUrl);
        if (!copied) {
            toast.error("Couldn't copy profile link");
            return;
        }
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
        toast.success("Profile link copied");
    }

    async function handleUsernameSave() {
        if (!address) return;
        setSavingUsername(true);
        const result = await updateUsername(address, usernameDraft);
        setSavingUsername(false);

        if (!result.success || !result.profile) {
            toast.error(result.error ?? "Failed to update username");
            return;
        }

        setProfile((current) =>
            current
                ? {
                      ...current,
                      username: result.profile.username,
                  }
                : current,
        );
        setUsernameDraft(result.profile.username ?? "");
        toast.success("Username updated");
    }

    async function handleEmailSave() {
        if (!address) return;
        setSavingEmail(true);
        const result = await updateEmail(address, emailDraft);
        setSavingEmail(false);

        if (!result.success || !result.profile) {
            toast.error(result.error ?? "Failed to update email");
            return;
        }

        setProfile((current) =>
            current
                ? {
                      ...current,
                      email: result.profile.email,
                  }
                : current,
        );
        setEmailDraft(result.profile.email ?? "");
        toast.success(result.profile.email ? "Email updated" : "Email cleared");
    }

    return (
        <main className="flex min-h-screen flex-col bg-black text-white selection:bg-white/20">
            <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black pointer-events-none" />

            <div className="container relative mx-auto flex flex-1 flex-col gap-6 px-3 pb-6 sm:px-6 sm:gap-8 max-w-2xl">
                {/* Wallet Address */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6">
                    <div className="flex flex-col gap-4 sm:flex-row-reverse sm:items-center">
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
                            <Image
                                src={profileMemoji}
                                alt="Profile memoji"
                                width={80}
                                height={80}
                                className="h-full w-full object-contain"
                            />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs uppercase tracking-widest text-white/40 mb-1">Profile</p>
                            <h1 className="truncate text-2xl font-semibold text-white">{displayName}</h1>
                            <p className="mt-1 text-xs uppercase tracking-widest text-white/30">Wallet Address</p>
                            <div className="mt-2 flex items-center gap-3">
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
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Link
                                    href={publicProfilePath}
                                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/12"
                                >
                                    View public profile
                                </Link>
                                <Link
                                    href="/claims"
                                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/12"
                                >
                                    Claims
                                </Link>
                                <button
                                    type="button"
                                    onClick={shareProfile}
                                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/12"
                                >
                                    {shareCopied ? <Check className="h-4 w-4 text-green-400" /> : <Share2 className="h-4 w-4" />}
                                    {shareCopied ? "Copied" : "Share profile"}
                                </button>
                            </div>
                            <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={publicProfileUrl}
                                    className="min-w-0 flex-1 bg-transparent text-sm text-white/75 outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={shareProfile}
                                    className="shrink-0 rounded-lg border border-white/10 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
                                    aria-label="Copy public profile link"
                                >
                                    {shareCopied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                                </button>
                            </div>
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                <input
                                    type="text"
                                    value={usernameDraft}
                                    onChange={(event) => setUsernameDraft(event.target.value)}
                                    placeholder="Choose username"
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition focus:border-white/20"
                                />
                                <button
                                    type="button"
                                    onClick={handleUsernameSave}
                                    disabled={savingUsername || usernameDraft.trim().toLowerCase() === (profile.username ?? "")}
                                    className="shrink-0 rounded-xl border border-white/10 bg-white/8 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {savingUsername ? "Saving…" : "Save"}
                                </button>
                            </div>
                            <p className="text-[11px] text-white/30">
                                Usernames are shown in live games and spectator views. Use 3-20 lowercase letters, numbers, or underscores.
                            </p>
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                <input
                                    type="email"
                                    value={emailDraft}
                                    onChange={(event) => setEmailDraft(event.target.value)}
                                    placeholder="Optional email"
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition focus:border-white/20"
                                />
                                <button
                                    type="button"
                                    onClick={handleEmailSave}
                                    disabled={savingEmail || emailDraft.trim().toLowerCase() === (profile.email ?? "")}
                                    className="shrink-0 rounded-xl border border-white/10 bg-white/8 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {savingEmail ? "Saving…" : "Save Email"}
                                </button>
                            </div>
                            <p className="text-[11px] text-white/30">
                                Optional for future updates and account contact. This does not change wallet login.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Ratings */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:p-6">
                    <p className="mb-3 text-center text-[11px] uppercase tracking-[0.22em] text-white/40 sm:mb-4 sm:text-xs sm:tracking-widest">Ratings</p>
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                        <RatingCard label="Bullet" value={profile.ratings.bullet} accent="text-sky-300" />
                        <RatingCard label="Blitz" value={profile.ratings.blitz} accent="text-amber-300" />
                        <RatingCard label="Rapid" value={profile.ratings.rapid} accent="text-emerald-300" />
                        <RatingCard label="Staked" value={profile.ratings.staked} accent="text-violet-300" />
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <StatCard icon={<Target className="h-4 w-4" />} label="Games" value={profile.totalGames} />
                    <StatCard icon={<Trophy className="h-4 w-4 text-green-400" />} label="Wins" value={profile.wins} />
                    <StatCard icon={<Minus className="h-4 w-4 text-red-400" />} label="Losses" value={profile.losses} />
                    <StatCard icon={<TrendingUp className="h-4 w-4 text-yellow-400" />} label="Win Rate" value={`${profile.winRate}%`} />
                    <StatCard icon={<Trophy className="h-4 w-4 text-violet-300" />} label="Total Staked" value={formatStakeAmount(profile.totalStakedAmount)} />
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
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
                                            <Image
                                                src={getMemojiForAddress(game.opponentAddress)}
                                                alt="Opponent avatar"
                                                width={40}
                                                height={40}
                                                className="h-full w-full object-contain"
                                            />
                                        </div>
                                        <div>
                                            <p className="text-sm font-mono text-white/80">
                                                {getDisplayName(game.opponentUsername, game.opponentAddress, "Opponent")}
                                            </p>
                                            <p className="text-xs text-white/30">
                                                {game.playedAs === "white" ? "White" : "Black"} &middot; Opp. {game.opponentRating}
                                            </p>
                                            <p className="text-[11px] text-white/35">
                                                {formatWalletAddress(game.opponentAddress)}
                                            </p>
                                            <p className="text-[11px] text-white/40">
                                                {getTimeControlDisplay(game.timeControl)}
                                            </p>
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${game.isStaked ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/5 text-white/45"}`}>
                                                    {game.isStaked ? "Staked" : "Casual"}
                                                </span>
                                                {game.onChainGameId ? (
                                                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-white/55">
                                                        Game #{game.onChainGameId}
                                                    </span>
                                                ) : null}
                                                {typeof game.wagerAmount === "number" ? (
                                                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/55">
                                                        Stake {formatStakeAmount(game.wagerAmount)}
                                                    </span>
                                                ) : null}
                                                {game.stakeToken ? (
                                                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-white/50">
                                                        {game.stakeToken.slice(0, 6)}...{game.stakeToken.slice(-4)}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-white/30">
                                            {new Date(game.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                        </p>
                                        <p className="mt-1 text-[11px] text-white/40">
                                            {new Date(game.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                        </p>
                                    </div>
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

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
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

function RatingCard({
    label,
    value,
    accent,
}: {
    label: string;
    value: number;
    accent: string;
}) {
    return (
        <div className="rounded-xl border border-white/10 bg-black/20 px-2.5 py-3 text-center sm:rounded-2xl sm:px-4 sm:py-4">
            <p className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${accent} sm:text-xs sm:tracking-[0.24em]`}>{label}</p>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-white sm:mt-2 sm:text-3xl">{value}</p>
        </div>
    );
}
