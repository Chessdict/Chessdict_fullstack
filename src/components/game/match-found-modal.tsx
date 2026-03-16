"use client";

import { useState } from "react";
import { GlassBg } from "../glass-bg";
import { formatName } from "@/lib/utils";
import { useChessdict, useTokenSymbol } from "@/hooks/useChessdict";

interface MatchFoundModalProps {
    opponent: string;
    color: "white" | "black";
    onAccept: () => void;
    onDecline?: () => void;
    // Staking info
    staked?: boolean;
    onChainGameId?: string | null;
    stakeToken?: string | null;
    stakeAmount?: string | null;
    roomId?: string;
    socket?: any;
}

type JoinState = "idle" | "joining" | "confirmed" | "failed";

export function MatchFoundModal({
    opponent,
    color,
    onAccept,
    onDecline,
    staked,
    onChainGameId,
    stakeToken,
    stakeAmount,
    roomId,
    socket,
}: MatchFoundModalProps) {
    const [joinState, setJoinState] = useState<JoinState>("idle");
    const { joinGameSingle, isLoading } = useChessdict();
    const { data: tokenSymbol } = useTokenSymbol(
        stakeToken ? (stakeToken as `0x${string}`) : null
    );

    const isCreator = staked && color === "white";
    const isJoiner = staked && color === "black";

    const handleJoinStake = async () => {
        if (!onChainGameId || !stakeToken || !stakeAmount || !roomId) return;
        setJoinState("joining");
        try {
            const ok = await joinGameSingle(
                BigInt(onChainGameId),
                stakeToken as `0x${string}`,
                stakeAmount,
            );
            if (ok) {
                setJoinState("confirmed");
                socket?.emit("stakeConfirmed", { roomId });
            } else {
                setJoinState("failed");
            }
        } catch {
            setJoinState("failed");
        }
    };

    const handleDeclineStake = () => {
        if (roomId) {
            socket?.emit("stakeDeclined", { roomId });
        }
        onDecline?.();
    };

    // ─── Staked + Creator (white): waiting for opponent ───
    if (isCreator) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="w-full max-w-sm animate-in zoom-in-95 duration-300">
                    <GlassBg className="p-5 sm:p-8 text-center" height="auto">
                        <div className="flex flex-col items-center gap-4 sm:gap-6">
                            <div className="relative">
                                <div className="h-18 w-18 sm:h-24 sm:w-24 rounded-full bg-linear-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center border border-white/10 shadow-xl shadow-yellow-500/10">
                                    <span className="text-2xl sm:text-3xl font-bold text-white uppercase">{opponent.slice(2, 4)}</span>
                                </div>
                                <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-yellow-500 border-4 border-[#121212] flex items-center justify-center">
                                    <div className="h-3 w-3 rounded-full border-2 border-yellow-200 border-t-transparent animate-spin" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <h2 className="text-lg sm:text-xl font-bold text-white">Match Found!</h2>
                                <p className="text-xs sm:text-sm text-white/60">
                                    Opponent: {formatName(opponent)}
                                </p>
                                {stakeAmount && (
                                    <p className="text-xs text-yellow-400 mt-1">
                                        Stake: {stakeAmount} {(tokenSymbol as string) ?? "tokens"}
                                    </p>
                                )}
                                <p className="text-[10px] sm:text-xs font-medium text-yellow-400 uppercase tracking-widest mt-2">
                                    Waiting for opponent to confirm stake...
                                </p>
                            </div>

                            <div className="w-full flex items-center justify-center py-3">
                                <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-yellow-400 animate-spin" />
                            </div>
                        </div>
                    </GlassBg>
                </div>
            </div>
        );
    }

    // ─── Staked + Joiner (black): confirm stake ───
    if (isJoiner) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="w-full max-w-sm animate-in zoom-in-95 duration-300">
                    <GlassBg className="p-5 sm:p-8 text-center" height="auto">
                        <div className="flex flex-col items-center gap-4 sm:gap-6">
                            <div className="relative">
                                <div className="h-18 w-18 sm:h-24 sm:w-24 rounded-full bg-linear-to-br from-green-500/20 to-blue-500/20 flex items-center justify-center border border-white/10 shadow-xl shadow-green-500/10">
                                    <span className="text-2xl sm:text-3xl font-bold text-white uppercase">{opponent.slice(2, 4)}</span>
                                </div>
                                <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-green-500 border-4 border-[#121212]" />
                            </div>

                            <div className="space-y-1">
                                <h2 className="text-lg sm:text-xl font-bold text-white">Match Found!</h2>
                                <p className="text-xs sm:text-sm text-white/60">
                                    Opponent: {formatName(opponent)}
                                </p>
                                <p className="text-[10px] sm:text-xs font-medium text-blue-400 uppercase tracking-widest mt-2">
                                    You are playing as {color}
                                </p>
                                {stakeAmount && (
                                    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                                        <p className="text-xs text-white/60">Stake required</p>
                                        <p className="text-lg font-bold text-white">
                                            {stakeAmount} {(tokenSymbol as string) ?? "tokens"}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {joinState === "idle" && (
                                <div className="w-full flex flex-col gap-2">
                                    <button
                                        onClick={handleJoinStake}
                                        disabled={isLoading}
                                        className="w-full relative group overflow-hidden rounded-full py-3 sm:py-4 transition-transform active:scale-95 disabled:opacity-50"
                                    >
                                        <div className="absolute inset-0 bg-linear-to-r from-green-600 to-blue-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                                        <span className="relative text-sm font-bold text-white">
                                            Confirm Stake & Join
                                        </span>
                                    </button>
                                    <button
                                        onClick={handleDeclineStake}
                                        className="w-full rounded-full py-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition border border-white/10"
                                    >
                                        Decline
                                    </button>
                                </div>
                            )}

                            {joinState === "joining" && (
                                <div className="w-full flex flex-col items-center gap-2 py-2">
                                    <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-green-400 animate-spin" />
                                    <p className="text-xs text-white/60">Confirming stake on-chain...</p>
                                </div>
                            )}

                            {joinState === "confirmed" && (
                                <button
                                    onClick={onAccept}
                                    className="w-full relative group overflow-hidden rounded-full py-3 sm:py-4 transition-transform active:scale-95 mt-1 sm:mt-2"
                                >
                                    <div className="absolute inset-0 bg-linear-to-r from-green-600 to-blue-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                                    <span className="relative text-sm font-bold text-white">Enter Match</span>
                                </button>
                            )}

                            {joinState === "failed" && (
                                <div className="w-full flex flex-col gap-2">
                                    <p className="text-xs text-red-400">Stake transaction failed</p>
                                    <button
                                        onClick={() => setJoinState("idle")}
                                        className="w-full relative group overflow-hidden rounded-full py-3 transition-transform active:scale-95"
                                    >
                                        <div className="absolute inset-0 bg-linear-to-r from-yellow-600 to-orange-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                                        <span className="relative text-sm font-bold text-white">Retry</span>
                                    </button>
                                    <button
                                        onClick={handleDeclineStake}
                                        className="w-full rounded-full py-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition border border-white/10"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    </GlassBg>
                </div>
            </div>
        );
    }

    // ─── Non-staked: original behavior ───
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-sm animate-in zoom-in-95 duration-300">
                <GlassBg className="p-5 sm:p-8 text-center" height="auto">
                    <div className="flex flex-col items-center gap-4 sm:gap-6">
                        <div className="relative">
                            <div className="h-18 w-18 sm:h-24 sm:w-24 rounded-full bg-linear-to-br from-green-500/20 to-blue-500/20 flex items-center justify-center border border-white/10 shadow-xl shadow-green-500/10">
                                <span className="text-2xl sm:text-3xl font-bold text-white uppercase">{opponent.slice(2, 4)}</span>
                            </div>
                            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-green-500 border-4 border-[#121212]" />
                        </div>

                        <div className="space-y-1">
                            <h2 className="text-lg sm:text-xl font-bold text-white">Match Found!</h2>
                            <p className="text-xs sm:text-sm text-white/60">
                                Opponent: {formatName(opponent)}
                            </p>
                            <p className="text-[10px] sm:text-xs font-medium text-blue-400 uppercase tracking-widest mt-2">
                                You are playing as {color}
                            </p>
                        </div>

                        <button
                            onClick={onAccept}
                            className="w-full relative group overflow-hidden rounded-full py-3 sm:py-4 transition-transform active:scale-95 mt-1 sm:mt-2"
                        >
                            <div className="absolute inset-0 bg-linear-to-r from-green-600 to-blue-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                            <span className="relative text-sm font-bold text-white">Enter Match</span>
                        </button>
                    </div>
                </GlassBg>
            </div>
        </div>
    );
}
