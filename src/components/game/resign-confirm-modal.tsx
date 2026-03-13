"use client";

import { GlassBg } from "../glass-bg";

interface ResignConfirmModalProps {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ResignConfirmModal({ isOpen, onConfirm, onCancel }: ResignConfirmModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-sm animate-in zoom-in-95 duration-300">
                <GlassBg className="p-5 sm:p-8 text-center" height="auto">
                    <div className="flex flex-col items-center gap-4 sm:gap-6">
                        <div className="relative">
                            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-linear-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center border border-white/10 shadow-xl shadow-red-500/10">
                                <svg className="h-8 w-8 sm:h-10 sm:w-10 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                                    <line x1="4" y1="22" x2="4" y2="15" />
                                </svg>
                            </div>
                        </div>

                        <div className="space-y-1 sm:space-y-2">
                            <h2 className="text-lg sm:text-xl font-bold text-white">Resign Game?</h2>
                            <p className="text-xs sm:text-sm text-white/60">
                                Are you sure you want to resign? This will count as a loss.
                            </p>
                        </div>

                        <div className="flex w-full gap-3 mt-2 sm:mt-4">
                            <button
                                onClick={onCancel}
                                className="flex-1 rounded-full py-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition border border-white/10"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    console.log("[MODAL] Confirm resign clicked");
                                    onConfirm();
                                }}
                                className="flex-1 relative group overflow-hidden rounded-full py-3 transition-transform active:scale-95"
                            >
                                <div className="absolute inset-0 bg-linear-to-r from-red-600 to-orange-600 opacity-90 group-hover:opacity-100 transition-opacity" />
                                <span className="relative text-sm font-bold text-white">Resign</span>
                            </button>
                        </div>
                    </div>
                </GlassBg>
            </div>
        </div>
    );
}
