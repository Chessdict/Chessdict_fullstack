"use client";

import { GlassBg } from "../glass-bg";

interface DrawOfferModalProps {
    isOpen: boolean;
    onAccept: () => void;
    onDecline: () => void;
}

export function DrawOfferModal({ isOpen, onAccept, onDecline }: DrawOfferModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-sm animate-in zoom-in-95 duration-300">
                <GlassBg className="p-5 sm:p-8 text-center" height={280}>
                    <div className="flex flex-col items-center gap-4 sm:gap-6">
                        <div className="relative">
                            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-linear-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center border border-white/10 shadow-xl shadow-yellow-500/10">
                                <svg className="h-8 w-8 sm:h-10 sm:w-10 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>

                        <div className="space-y-1 sm:space-y-2">
                            <h2 className="text-lg sm:text-xl font-bold text-white">Draw Offered</h2>
                            <p className="text-xs sm:text-sm text-white/60">
                                Your opponent is offering a draw. Do you accept?
                            </p>
                        </div>

                        <div className="flex w-full gap-3 mt-2 sm:mt-4">
                            <button
                                onClick={onDecline}
                                className="flex-1 rounded-full py-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition border border-white/10"
                            >
                                Decline
                            </button>
                            <button
                                onClick={onAccept}
                                className="flex-1 relative group overflow-hidden rounded-full py-3 transition-transform active:scale-95"
                            >
                                <div className="absolute inset-0 bg-linear-to-r from-yellow-600 to-orange-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                                <span className="relative text-sm font-bold text-white">Accept Draw</span>
                            </button>
                        </div>
                    </div>
                </GlassBg>
            </div>
        </div>
    );
}
