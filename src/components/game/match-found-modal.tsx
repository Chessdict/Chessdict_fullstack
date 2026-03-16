"use client";

import { useState, useEffect, useRef } from "react";
import { GlassBg } from "../glass-bg";
import { formatName } from "@/lib/utils";
import { useChessdict, useTokenSymbol, useTokenDecimals } from "@/hooks/useChessdict";

interface MatchFoundModalProps {
    opponent: string;
    color: "white" | "black";
    onAccept: () => void;
    onDecline?: () => void;
    // Staking info
    staked?: boolean;
    stakeToken?: string | null;
    stakeAmount?: string | null;
    roomId?: string;
    socket?: any;
}

type CreatorState = "creating" | "waiting" | "failed";
type JoinerState = "waiting-for-creator" | "idle" | "joining" | "confirmed" | "failed";

export function MatchFoundModal({
    opponent,
    color,
    onAccept,
    onDecline,
    staked,
    stakeToken,
    stakeAmount,
    roomId,
    socket,
}: MatchFoundModalProps) {
    const [creatorState, setCreatorState] = useState<CreatorState>("creating");
    const [joinerState, setJoinerState] = useState<JoinerState>("waiting-for-creator");
    const [onChainGameId, setOnChainGameId] = useState<string | null>(null);
    const hasStartedCreation = useRef(false);

    const { createGameSingle, joinGameSingle, isLoading } = useChessdict();
    const { data: tokenSymbol } = useTokenSymbol(
        stakeToken ? (stakeToken as `0x${string}`) : null
    );
    const { data: tokenDecimalsData } = useTokenDecimals(
        stakeToken ? (stakeToken as `0x${string}`) : null
    );

    const isCreator = staked && color === "white";
    const isJoiner = staked && color === "black";

    // ─── Player 1 (white/creator): auto-create on-chain game on mount ───
    useEffect(() => {
        if (!isCreator || !stakeToken || !stakeAmount || !roomId || hasStartedCreation.current) return;
        hasStartedCreation.current = true;

        const decimals = (tokenDecimalsData as number) ?? 18;

        (async () => {
            try {
                const result = await createGameSingle(
                    stakeToken as `0x${string}`,
                    stakeAmount,
                    decimals,
                );
                if (result.success && result.onChainGameId) {
                    setOnChainGameId(result.onChainGameId);
                    socket?.emit("stakeCreated", { roomId, onChainGameId: result.onChainGameId });
                    setCreatorState("waiting");
                } else {
                    setCreatorState("failed");
                }
            } catch {
                setCreatorState("failed");
            }
        })();
    }, [isCreator, stakeToken, stakeAmount, roomId, tokenDecimalsData, createGameSingle, socket]);

    // ─── Player 2 (black/joiner): listen for stakeReady from server ───
    useEffect(() => {
        if (!isJoiner || !socket) return;

        const handleStakeReady = (data: { roomId: string; onChainGameId: string; stakeToken: string; stakeAmount: string }) => {
            if (data.roomId === roomId) {
                setOnChainGameId(data.onChainGameId);
                setJoinerState("idle");
            }
        };

        socket.on("stakeReady", handleStakeReady);
        return () => { socket.off("stakeReady", handleStakeReady); };
    }, [isJoiner, socket, roomId]);

    const handleRetryCreate = async () => {
        if (!stakeToken || !stakeAmount || !roomId) return;
        setCreatorState("creating");
        const decimals = (tokenDecimalsData as number) ?? 18;

        try {
            const result = await createGameSingle(
                stakeToken as `0x${string}`,
                stakeAmount,
                decimals,
            );
            if (result.success && result.onChainGameId) {
                setOnChainGameId(result.onChainGameId);
                socket?.emit("stakeCreated", { roomId, onChainGameId: result.onChainGameId });
                setCreatorState("waiting");
            } else {
                setCreatorState("failed");
            }
        } catch {
            setCreatorState("failed");
        }
    };

    const handleJoinStake = async () => {
        if (!onChainGameId || !stakeToken || !stakeAmount || !roomId) return;
        setJoinerState("joining");
        try {
            const ok = await joinGameSingle(
                BigInt(onChainGameId),
                stakeToken as `0x${string}`,
                stakeAmount,
            );
            if (ok) {
                setJoinerState("confirmed");
                socket?.emit("stakeConfirmed", { roomId });
            } else {
                setJoinerState("failed");
            }
        } catch {
            setJoinerState("failed");
        }
    };

    const handleDeclineStake = () => {
        if (roomId) {
            socket?.emit("stakeDeclined", { roomId });
        }
        onDecline?.();
    };

    // ─── Staked + Creator (white): create on-chain then wait ───
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
                            </div>

                            {creatorState === "creating" && (
                                <div className="w-full flex flex-col items-center gap-2 py-3">
                                    <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-yellow-400 animate-spin" />
                                    <p className="text-[10px] sm:text-xs font-medium text-yellow-400 uppercase tracking-widest">
                                        Creating game on-chain...
                                    </p>
                                </div>
                            )}

                            {creatorState === "waiting" && (
                                <div className="w-full flex flex-col items-center gap-2 py-3">
                                    <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-yellow-400 animate-spin" />
                                    <p className="text-[10px] sm:text-xs font-medium text-yellow-400 uppercase tracking-widest">
                                        Waiting for opponent to confirm stake...
                                    </p>
                                </div>
                            )}

                            {creatorState === "failed" && (
                                <div className="w-full flex flex-col gap-2">
                                    <p className="text-xs text-red-400">On-chain game creation failed</p>
                                    <button
                                        onClick={handleRetryCreate}
                                        disabled={isLoading}
                                        className="w-full relative group overflow-hidden rounded-full py-3 transition-transform active:scale-95 disabled:opacity-50"
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

    // ─── Staked + Joiner (black): wait for creator, then confirm stake ───
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

                            {joinerState === "waiting-for-creator" && (
                                <div className="w-full flex flex-col items-center gap-2 py-3">
                                    <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-blue-400 animate-spin" />
                                    <p className="text-[10px] sm:text-xs font-medium text-blue-400 uppercase tracking-widest">
                                        Waiting for opponent to create game...
                                    </p>
                                </div>
                            )}

                            {joinerState === "idle" && (
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

                            {joinerState === "joining" && (
                                <div className="w-full flex flex-col items-center gap-2 py-2">
                                    <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-green-400 animate-spin" />
                                    <p className="text-xs text-white/60">Confirming stake on-chain...</p>
                                </div>
                            )}

                            {joinerState === "confirmed" && (
                                <button
                                    onClick={onAccept}
                                    className="w-full relative group overflow-hidden rounded-full py-3 sm:py-4 transition-transform active:scale-95 mt-1 sm:mt-2"
                                >
                                    <div className="absolute inset-0 bg-linear-to-r from-green-600 to-blue-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                                    <span className="relative text-sm font-bold text-white">Enter Match</span>
                                </button>
                            )}

                            {joinerState === "failed" && (
                                <div className="w-full flex flex-col gap-2">
                                    <p className="text-xs text-red-400">Stake transaction failed</p>
                                    <button
                                        onClick={() => setJoinerState("idle")}
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
