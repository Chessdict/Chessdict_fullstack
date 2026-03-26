"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { GlassBg } from "../glass-bg";
import { cn, formatName } from "@/lib/utils";
import { useChessdict, useTokenSymbol, useTokenDecimals } from "@/hooks/useChessdict";
import { getMemojiForAddress } from "@/lib/memoji";
import { useAccount } from "wagmi";
import {
    getTimeControlDisplay,
    normalizeTimeControlMinutes,
} from "@/lib/time-control";

interface MatchFoundModalProps {
    opponent: string;
    color: "white" | "black";
    onAccept: () => void;
    onDecline?: () => void;
    memoji?: string | null;
    autoEnter?: boolean;
    // Staking info
    staked?: boolean;
    stakeToken?: string | null;
    stakeAmount?: string | null;
    requestedStakeAmount?: string | null;
    timeControl?: number;
    roomId?: string;
    existingOnChainGameId?: string | null;
    socket?: any;
}

type CreatorState = "idle" | "creating" | "waiting" | "failed" | "expired" | "opponent-left" | "cancelling" | "reclaimed";
type JoinerState = "waiting-for-creator" | "creator-failed" | "expired" | "idle" | "joining" | "confirmed" | "failed";

function formatAmountDisplay(value: number | null) {
    if (value == null || !Number.isFinite(value)) return null;
    const rounded = value.toFixed(value % 1 === 0 ? 0 : 4);
    return rounded.replace(/\.?0+$/, "");
}

function MatchFaceoffHero({
    introReady,
    playerMemoji,
    opponentMemoji,
    playerLabel,
    opponentLabel,
}: {
    introReady: boolean;
    playerMemoji: string;
    opponentMemoji: string;
    playerLabel: string;
    opponentLabel: string;
}) {
    return (
        <div className="relative flex h-36 w-full items-center justify-center overflow-hidden">
            <div
                className={cn(
                    "absolute left-0 flex w-[44%] flex-col items-center gap-2 transition-all duration-500 ease-out",
                    introReady ? "translate-x-0 opacity-100" : "-translate-x-8 opacity-0",
                )}
            >
                <div className="h-18 w-18 sm:h-24 sm:w-24 rounded-full bg-linear-to-br from-green-500/20 to-blue-500/20 flex items-center justify-center border border-white/10 shadow-xl shadow-green-500/10 overflow-hidden">
                    <Image src={playerMemoji} alt="You" width={96} height={96} className="h-full w-full object-contain" />
                </div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-green-300/80">You</p>
                <p className="max-w-full truncate text-[11px] text-white/55">{playerLabel}</p>
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
                <div
                    className={cn(
                        "absolute h-18 w-18 rounded-full bg-blue-500/20 blur-xl transition-all duration-500",
                        introReady ? "scale-110 opacity-100" : "scale-50 opacity-0",
                    )}
                />
                <div
                    className={cn(
                        "relative z-10 flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-white/10 text-sm font-black tracking-[0.35em] text-white shadow-lg backdrop-blur-xl transition-all duration-500",
                        introReady ? "scale-100 opacity-100" : "scale-75 opacity-0",
                    )}
                >
                    VS
                </div>
            </div>

            <div
                className={cn(
                    "absolute right-0 flex w-[44%] flex-col items-center gap-2 transition-all duration-500 ease-out",
                    introReady ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0",
                )}
            >
                <div className="h-18 w-18 sm:h-24 sm:w-24 rounded-full bg-linear-to-br from-green-500/20 to-blue-500/20 flex items-center justify-center border border-white/10 shadow-xl shadow-green-500/10 overflow-hidden">
                    <Image src={opponentMemoji} alt="Opponent" width={96} height={96} className="h-full w-full object-contain" />
                </div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-blue-300/80">Opponent</p>
                <p className="max-w-full truncate text-[11px] text-white/55">{opponentLabel}</p>
            </div>
        </div>
    );
}

export function MatchFoundModal({
    opponent,
    color,
    onAccept,
    onDecline,
    memoji,
    autoEnter = false,
    staked,
    stakeToken,
    stakeAmount,
    requestedStakeAmount,
    timeControl,
    roomId,
    existingOnChainGameId,
    socket,
}: MatchFoundModalProps) {
    const { address } = useAccount();
    const [creatorState, setCreatorState] = useState<CreatorState>("idle");
    const [joinerState, setJoinerState] = useState<JoinerState>("waiting-for-creator");
    const [onChainGameId, setOnChainGameId] = useState<string | null>(null);
    const [introReady, setIntroReady] = useState(false);
    const hasStartedCreation = useRef(false);
    const hasAutoEntered = useRef(false);
    const onAcceptRef = useRef(onAccept);

    const { createGameSingle, joinGameSingle, cancelGameSingle, isLoading } = useChessdict();
    const { data: tokenSymbol } = useTokenSymbol(
        stakeToken ? (stakeToken as `0x${string}`) : null
    );
    const { data: tokenDecimalsData } = useTokenDecimals(
        stakeToken ? (stakeToken as `0x${string}`) : null
    );

    const isCreator = staked && color === "white";
    const isJoiner = staked && color === "black";
    const opponentMemoji = memoji ?? getMemojiForAddress(opponent);
    const playerMemoji = getMemojiForAddress(address ?? "player");
    const playerLabel = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "You";
    const timeControlMinutes = normalizeTimeControlMinutes(timeControl);
    const timeControlDisplay = getTimeControlDisplay(timeControlMinutes);
    const tokenLabel = (tokenSymbol as string) ?? "tokens";
    const matchedStakeValue = Number.parseFloat(stakeAmount ?? "");
    const requestedStakeValue = Number.parseFloat(requestedStakeAmount ?? "");
    const totalPrizeDisplay = formatAmountDisplay(
        Number.isFinite(matchedStakeValue) ? matchedStakeValue * 2 : null,
    );
    const matchedAtLowerStake =
        Number.isFinite(matchedStakeValue) &&
        Number.isFinite(requestedStakeValue) &&
        matchedStakeValue > 0 &&
        matchedStakeValue < requestedStakeValue;

    useEffect(() => {
        onAcceptRef.current = onAccept;
    }, [onAccept]);

    useEffect(() => {
        const frame = requestAnimationFrame(() => setIntroReady(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    useEffect(() => {
        if (!staked || !existingOnChainGameId) return;

        // Reconnects into a WAITING staked room should reopen the setup state, not restart creation.
        setOnChainGameId(existingOnChainGameId);
        if (isCreator) {
            hasStartedCreation.current = true;
            setCreatorState((current) =>
                current === "opponent-left" || current === "reclaimed" ? current : "waiting"
            );
        }
        if (isJoiner) {
            setJoinerState((current) =>
                current === "confirmed" ? current : "idle"
            );
        }
    }, [existingOnChainGameId, isCreator, isJoiner, staked]);

    useEffect(() => {
        if (!autoEnter || hasAutoEntered.current) return;
        hasAutoEntered.current = true;

        const timer = window.setTimeout(() => {
            onAcceptRef.current();
        }, 1200);

        return () => window.clearTimeout(timer);
    }, [autoEnter]);

    const startStakeCreation = async () => {
        if (!stakeToken || !stakeAmount || !roomId || tokenDecimalsData == null) return;
        hasStartedCreation.current = true;
        setCreatorState("creating");
        const decimals = tokenDecimalsData as number;

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
                socket?.emit("stakeCreationFailed", { roomId });
                setCreatorState("failed");
                hasStartedCreation.current = false;
            }
        } catch {
            socket?.emit("stakeCreationFailed", { roomId });
            setCreatorState("failed");
            hasStartedCreation.current = false;
        }
    };

    // ─── Player 1 (white/creator): listen for opponent leaving/declining/timeout ───
    useEffect(() => {
        if (!isCreator || !socket) return;

        const handleOpponentLeft = (data: { roomId: string; onChainGameId?: string }) => {
            if (data.roomId === roomId) {
                if (data.onChainGameId) setOnChainGameId(data.onChainGameId);
                setCreatorState("opponent-left");
            }
        };

        const handleStakeTimeout = (data: { roomId: string; onChainGameId?: string }) => {
            if (data.roomId === roomId) {
                if (data.onChainGameId) setOnChainGameId(data.onChainGameId);
                setCreatorState("opponent-left");
            }
        };

        const handleStakeCreationExpired = (data: { roomId: string }) => {
            if (data.roomId === roomId) {
                hasStartedCreation.current = false;
                setCreatorState("expired");
            }
        };

        socket.on("opponentDeclinedStake", handleOpponentLeft);
        socket.on("stakeTimeout", handleStakeTimeout);
        socket.on("stakeCreationExpired", handleStakeCreationExpired);
        return () => {
            socket.off("opponentDeclinedStake", handleOpponentLeft);
            socket.off("stakeTimeout", handleStakeTimeout);
            socket.off("stakeCreationExpired", handleStakeCreationExpired);
        };
    }, [isCreator, socket, roomId]);

    // ─── Player 2 (black/joiner): listen for stakeReady from server ───
    useEffect(() => {
        if (!isJoiner || !socket) return;

        const handleStakeReady = (data: { roomId: string; onChainGameId: string; stakeToken: string; stakeAmount: string }) => {
            if (data.roomId === roomId) {
                setOnChainGameId(data.onChainGameId);
                setJoinerState("idle");
            }
        };

        const handleStakeCreationFailed = (data: { roomId: string }) => {
            if (data.roomId === roomId) {
                setJoinerState("creator-failed");
            }
        };

        const handleStakeCreationExpired = (data: { roomId: string }) => {
            if (data.roomId === roomId) {
                setJoinerState("expired");
            }
        };

        socket.on("stakeReady", handleStakeReady);
        socket.on("stakeCreationFailed", handleStakeCreationFailed);
        socket.on("stakeCreationExpired", handleStakeCreationExpired);
        return () => {
            socket.off("stakeReady", handleStakeReady);
            socket.off("stakeCreationFailed", handleStakeCreationFailed);
            socket.off("stakeCreationExpired", handleStakeCreationExpired);
        };
    }, [isJoiner, socket, roomId]);

    const handleRetryCreate = async () => {
        hasStartedCreation.current = false;
        await startStakeCreation();
    };

    const handleJoinStake = async () => {
        if (!onChainGameId || !stakeToken || !stakeAmount || !roomId || tokenDecimalsData == null) return;
        setJoinerState("joining");
        const decimals = tokenDecimalsData as number;
        try {
            const ok = await joinGameSingle(
                BigInt(onChainGameId),
                stakeToken as `0x${string}`,
                stakeAmount,
                decimals,
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

    const handleCancelAndReclaim = async () => {
        if (!onChainGameId) {
            onDecline?.();
            return;
        }
        setCreatorState("cancelling");
        try {
            await cancelGameSingle(BigInt(onChainGameId));
            setCreatorState("reclaimed");
        } catch {
            setCreatorState("opponent-left");
        }
    };

    if (staked && autoEnter) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="w-full max-w-sm animate-in zoom-in-95 duration-300">
                    <GlassBg className="p-5 sm:p-8 text-center" height="auto">
                        <div className="flex flex-col items-center gap-5 sm:gap-6">
                            <div className="space-y-1">
                                <h2 className="text-lg sm:text-xl font-bold text-white">Staked Game Ready</h2>
                                <p className="text-xs sm:text-sm text-white/60">
                                    Both stakes confirmed on-chain
                                </p>
                            </div>

                            <MatchFaceoffHero
                                introReady={introReady}
                                playerMemoji={playerMemoji}
                                opponentMemoji={opponentMemoji}
                                playerLabel={playerLabel}
                                opponentLabel={formatName(opponent)}
                            />

                            <div className="space-y-2">
                                <p className="text-[10px] sm:text-xs font-medium text-blue-400 uppercase tracking-widest">
                                    You are playing as {color}
                                </p>
                                <p className="text-[10px] font-medium uppercase tracking-widest text-blue-300/80">
                                    {timeControlDisplay}
                                </p>
                                {stakeAmount ? (
                                    <div className="space-y-1">
                                        <p className="text-xs text-yellow-400">
                                            Stake: {stakeAmount} {tokenLabel}
                                        </p>
                                        {totalPrizeDisplay && (
                                            <p className="text-xs text-white/55">
                                                Total prize: {totalPrizeDisplay} {tokenLabel}
                                            </p>
                                        )}
                                    </div>
                                ) : null}
                                <p className="text-xs text-white/45">
                                    Starting the board...
                                </p>
                            </div>

                            <button
                                onClick={onAccept}
                                className="w-full relative group overflow-hidden rounded-full py-3 sm:py-4 transition-transform active:scale-95"
                            >
                                <div className="absolute inset-0 bg-linear-to-r from-green-600 to-blue-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                                <span className="relative text-sm font-bold text-white">
                                    Battle of Chessdicts ⚔️
                                </span>
                            </button>
                        </div>
                    </GlassBg>
                </div>
            </div>
        );
    }

    // ─── Staked + Creator (white): create on-chain then wait ───
    if (isCreator) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="w-full max-w-sm animate-in zoom-in-95 duration-300">
                    <GlassBg className="p-5 sm:p-8 text-center" height="auto">
                        <div className="flex flex-col items-center gap-4 sm:gap-6">
                            <div className="relative">
                                <div className="h-18 w-18 sm:h-24 sm:w-24 rounded-full bg-linear-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center border border-white/10 shadow-xl shadow-yellow-500/10 overflow-hidden">
                                    <Image src={opponentMemoji} alt="Opponent" width={96} height={96} className="h-full w-full object-contain" />
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
                                <p className="text-[10px] sm:text-xs font-medium text-yellow-400 uppercase tracking-widest mt-2">
                                    You are playing as {color}
                                </p>
                            </div>

                            <div className="space-y-1">
                                <p className="mt-2 text-[10px] font-medium uppercase tracking-widest text-blue-300/80">
                                    {timeControlDisplay}
                                </p>
                                {stakeAmount && (
                                    <div className="mt-1 space-y-2">
                                        <p className="text-xs text-yellow-400">
                                            Stake: {stakeAmount} {tokenLabel}
                                        </p>
                                        {totalPrizeDisplay && (
                                            <p className="text-[11px] text-white/55">
                                                Total prize: {totalPrizeDisplay} {tokenLabel}
                                            </p>
                                        )}
                                        {matchedAtLowerStake && (
                                            <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-left">
                                                <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-300">
                                                    Matched at lower stake
                                                </p>
                                                <p className="mt-1 text-[10px] leading-relaxed text-white/60">
                                                    Using opponent&apos;s lower amount 🤝
                                                </p>
                                            </div>
                                        )}
                                    </div>
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

                            {creatorState === "idle" && (
                                <div className="w-full flex flex-col gap-2">
                                    <button
                                        onClick={startStakeCreation}
                                        disabled={isLoading || tokenDecimalsData == null}
                                        className="w-full relative group overflow-hidden rounded-full py-3 sm:py-4 transition-transform active:scale-95 disabled:opacity-50"
                                    >
                                        <div className="absolute inset-0 bg-linear-to-r from-yellow-600 to-orange-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                                        <span className="relative text-sm font-bold text-white">
                                            Create Staked Game
                                        </span>
                                    </button>
                                    <button
                                        onClick={handleDeclineStake}
                                        className="w-full rounded-full py-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition border border-white/10"
                                    >
                                        Cancel
                                    </button>
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

                            {creatorState === "expired" && (
                                <div className="w-full flex flex-col gap-3">
                                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
                                        <p className="text-xs text-red-400 font-medium">Match expired before game creation</p>
                                        <p className="text-[10px] text-white/50 mt-1">
                                            The staked setup timed out before the on-chain game was created.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => onDecline?.()}
                                        className="w-full relative group overflow-hidden rounded-full py-3 transition-transform active:scale-95"
                                    >
                                        <div className="absolute inset-0 bg-linear-to-r from-yellow-600 to-orange-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                                        <span className="relative text-sm font-bold text-white">Close</span>
                                    </button>
                                </div>
                            )}

                            {creatorState === "opponent-left" && (
                                <div className="w-full flex flex-col gap-3">
                                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
                                        <p className="text-xs text-red-400 font-medium">Opponent left the match</p>
                                        <p className="text-[10px] text-white/50 mt-1">
                                            {onChainGameId
                                                ? "Cancel the on-chain game to reclaim your stake"
                                                : "No on-chain game was created. You can leave this match safely."}
                                        </p>
                                    </div>
                                    {onChainGameId ? (
                                        <button
                                            onClick={handleCancelAndReclaim}
                                            disabled={isLoading}
                                            className="w-full relative group overflow-hidden rounded-full py-3 transition-transform active:scale-95 disabled:opacity-50"
                                        >
                                            <div className="absolute inset-0 bg-linear-to-r from-yellow-600 to-orange-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                                            <span className="relative text-sm font-bold text-white">
                                                Cancel Game & Reclaim Stake
                                            </span>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => onDecline?.()}
                                            className="w-full relative group overflow-hidden rounded-full py-3 transition-transform active:scale-95"
                                        >
                                            <div className="absolute inset-0 bg-linear-to-r from-yellow-600 to-orange-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                                            <span className="relative text-sm font-bold text-white">Close</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={() => onDecline?.()}
                                        className="w-full rounded-full py-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition border border-white/10"
                                    >
                                        {onChainGameId ? "Dismiss (reclaim later)" : "Dismiss"}
                                    </button>
                                </div>
                            )}

                            {creatorState === "cancelling" && (
                                <div className="w-full flex flex-col items-center gap-2 py-3">
                                    <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-yellow-400 animate-spin" />
                                    <p className="text-[10px] sm:text-xs font-medium text-yellow-400 uppercase tracking-widest">
                                        Cancelling game & reclaiming stake...
                                    </p>
                                </div>
                            )}

                            {creatorState === "reclaimed" && (
                                <div className="w-full flex flex-col gap-3">
                                    <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3">
                                        <p className="text-xs text-green-400 font-medium">Stake reclaimed successfully</p>
                                    </div>
                                    <button
                                        onClick={() => onDecline?.()}
                                        className="w-full relative group overflow-hidden rounded-full py-3 transition-transform active:scale-95"
                                    >
                                        <div className="absolute inset-0 bg-linear-to-r from-green-600 to-blue-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                                        <span className="relative text-sm font-bold text-white">Done</span>
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
                                <div className="h-18 w-18 sm:h-24 sm:w-24 rounded-full bg-linear-to-br from-green-500/20 to-blue-500/20 flex items-center justify-center border border-white/10 shadow-xl shadow-green-500/10 overflow-hidden">
                                    <Image src={opponentMemoji} alt="Opponent" width={96} height={96} className="h-full w-full object-contain" />
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

                            <div className="space-y-1">
                                <p className="mt-2 text-[10px] font-medium uppercase tracking-widest text-blue-300/80">
                                    {timeControlDisplay}
                                </p>
                                {stakeAmount && (
                                    <div className="mt-3 space-y-3">
                                        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                                            <p className="text-xs text-white/60">Stake required</p>
                                            <p className="text-lg font-bold text-white">
                                                {stakeAmount} {tokenLabel}
                                            </p>
                                            {totalPrizeDisplay && (
                                                <p className="mt-1 text-[11px] text-white/50">
                                                    Total prize: {totalPrizeDisplay} {tokenLabel}
                                                </p>
                                            )}
                                        </div>
                                        {matchedAtLowerStake && (
                                            <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-left">
                                                <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-300">
                                                    Matched at lower stake
                                                </p>
                                                <p className="mt-1 text-[10px] leading-relaxed text-white/60">
                                                    Using opponent&apos;s lower amount 🤝
                                                </p>
                                            </div>
                                        )}
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

                            {joinerState === "creator-failed" && (
                                <div className="w-full flex flex-col gap-3">
                                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-left">
                                        <p className="text-xs text-red-400 font-medium">Opponent failed to create the staked game</p>
                                        <p className="text-[10px] text-white/50 mt-1">
                                            You can wait for them to retry, or leave this match now.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleDeclineStake}
                                        className="w-full rounded-full py-3 text-sm font-medium text-white/80 hover:text-white hover:bg-white/5 transition border border-white/10"
                                    >
                                        Leave Match
                                    </button>
                                </div>
                            )}

                            {joinerState === "expired" && (
                                <div className="w-full flex flex-col gap-3">
                                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-left">
                                        <p className="text-xs text-red-400 font-medium">Creator did not create the staked game in time</p>
                                        <p className="text-[10px] text-white/50 mt-1">
                                            This staked setup expired before the on-chain game was created.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleDeclineStake}
                                        className="w-full rounded-full py-3 text-sm font-medium text-white/80 hover:text-white hover:bg-white/5 transition border border-white/10"
                                    >
                                        Leave Match
                                    </button>
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
                    <div className="flex flex-col items-center gap-5 sm:gap-6">
                        <div className="space-y-1">
                            <h2 className="text-lg sm:text-xl font-bold text-white">Match Found!</h2>
                            <p className="text-xs sm:text-sm text-white/60">
                                Pairing you against {formatName(opponent)}
                            </p>
                        </div>

                        <MatchFaceoffHero
                            introReady={introReady}
                            playerMemoji={playerMemoji}
                            opponentMemoji={opponentMemoji}
                            playerLabel={playerLabel}
                            opponentLabel={formatName(opponent)}
                        />

                        <div className="space-y-2">
                            <p className="text-[10px] sm:text-xs font-medium text-blue-400 uppercase tracking-widest">
                                You are playing as {color}
                            </p>
                            <p className="text-[10px] font-medium uppercase tracking-widest text-blue-300/80">
                                {timeControlDisplay}
                            </p>
                            <p className="text-xs text-white/45">
                                {autoEnter ? "Starting the board..." : "Ready to enter the match."}
                            </p>
                        </div>

                        <button
                            onClick={onAccept}
                            className="w-full relative group overflow-hidden rounded-full py-3 sm:py-4 transition-transform active:scale-95"
                        >
                            <div className="absolute inset-0 bg-linear-to-r from-green-600 to-blue-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                            <span className="relative text-sm font-bold text-white">
                                Battle of Chessdicts ⚔️
                            </span>
                        </button>
                    </div>
                </GlassBg>
            </div>
        </div>
    );
}
