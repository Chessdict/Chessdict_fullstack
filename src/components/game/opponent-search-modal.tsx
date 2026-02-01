"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";

interface OpponentSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function OpponentSearchModal({ isOpen, onClose }: OpponentSearchModalProps) {
    // Prevent scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => {
            document.body.style.overflow = "unset";
        };
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop with blur */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="relative w-full max-w-md overflow-hidden rounded-[32px] border border-white/10 bg-[#0A0A0A] shadow-2xl"
                    >
                        {/* Header */}
                        <div className="relative flex items-center justify-center border-b border-white/5 p-6">
                            <h2 className="text-lg font-medium text-white">Searching for Opponent</h2>
                            <button
                                onClick={onClose}
                                className="absolute right-6 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex flex-col p-8">
                            <div className="flex flex-col items-center justify-center gap-6 py-8">
                                <div className="relative h-20 w-20">
                                    <div className="absolute inset-0 rounded-full border-4 border-white/5" />
                                    <div className="absolute inset-0 rounded-full border-4 border-t-white animate-spin" />
                                </div>
                                <div className="text-center">
                                    <p className="text-white font-medium">Matching you with an opponent...</p>
                                    <p className="text-white/40 text-sm mt-1">This usually takes a few seconds</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
