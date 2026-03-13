"use client";

import { GlassBg } from "../glass-bg";
import { formatName } from "@/lib/utils";

interface MatchFoundModalProps {
    opponent: string;
    color: "white" | "black";
    onAccept: () => void;
}

export function MatchFoundModal({ opponent, color, onAccept }: MatchFoundModalProps) {
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
