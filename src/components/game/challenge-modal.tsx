"use client";

import { GlassBg } from "../glass-bg";
import { GlassButton } from "../glass-button";
import Image from "next/image";
import { formatName } from "@/lib/utils";

interface ChallengeModalProps {
    from: string;
    onAccept: () => void;
    onDecline: () => void;
}

export function ChallengeModal({ from, onAccept, onDecline }: ChallengeModalProps) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-sm animate-in zoom-in-95 duration-300">
                <GlassBg className="p-8 text-center" height={300}>
                    <div className="flex flex-col items-center gap-6">
                        <div className="relative">
                            <div className="h-24 w-24 rounded-full bg-linear-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-white/10 shadow-xl shadow-blue-500/10">
                                <span className="text-3xl font-bold text-white uppercase">{from.slice(2, 4)}</span>
                            </div>
                            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-green-500 border-4 border-[#121212]" />
                        </div>

                        <div className="space-y-1">
                            <h2 className="text-xl font-bold text-white">Incoming Challenge</h2>
                            <p className="text-sm text-white/60">
                                {formatName(from)} wants to play a match
                            </p>
                        </div>

                        <div className="flex w-full gap-3 mt-4">
                            <button
                                onClick={onDecline}
                                className="flex-1 rounded-full py-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition"
                            >
                                Decline
                            </button>
                            <button
                                onClick={onAccept}
                                className="flex-1 relative group overflow-hidden rounded-full py-3 transition-transform active:scale-95"
                            >
                                <div className="absolute inset-0 bg-linear-to-r from-blue-600 to-purple-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                                <span className="relative text-sm font-bold text-white">Accept</span>
                            </button>
                        </div>
                    </div>
                </GlassBg>
            </div>
        </div>
    );
}
