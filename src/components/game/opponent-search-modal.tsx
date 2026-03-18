"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { GlassBg } from "../glass-bg";
import { MEMOJI_LIST } from "@/lib/memoji";

interface OpponentSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** The memoji that was showing when a match was found */
    onMemojiSelected?: (memoji: string) => void;
}

export function OpponentSearchModal({ isOpen, onClose, onMemojiSelected }: OpponentSearchModalProps) {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Cycle through memojis while searching
    useEffect(() => {
        if (!isOpen) return;
        // Start at a random position
        setCurrentIndex(Math.floor(Math.random() * MEMOJI_LIST.length));

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % MEMOJI_LIST.length);
        }, 400);

        return () => clearInterval(interval);
    }, [isOpen]);

    // Report current memoji when modal closes (match found)
    const handleClose = useCallback(() => {
        onMemojiSelected?.(MEMOJI_LIST[currentIndex]);
        onClose();
    }, [currentIndex, onClose, onMemojiSelected]);

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
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop with blur */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="relative w-full max-w-sm"
                    >
                        <GlassBg className="p-5 sm:p-8 text-center" height="auto">
                            <div className="flex flex-col items-center gap-4 sm:gap-6">
                                {/* Close button */}
                                <button
                                    onClick={handleClose}
                                    className="absolute right-6 top-6 rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white transition-colors z-20"
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

                                {/* Cycling memoji avatar */}
                                <div className="relative">
                                    <div className="h-24 w-24 rounded-full bg-linear-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-white/10 shadow-xl shadow-blue-500/10 overflow-hidden">
                                        <AnimatePresence mode="wait">
                                            <motion.div
                                                key={currentIndex}
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.8 }}
                                                transition={{ duration: 0.2 }}
                                                className="h-20 w-20"
                                            >
                                                <Image
                                                    src={MEMOJI_LIST[currentIndex]}
                                                    alt="Searching..."
                                                    width={80}
                                                    height={80}
                                                    className="h-full w-full object-contain"
                                                />
                                            </motion.div>
                                        </AnimatePresence>
                                        <div className="absolute inset-0 rounded-full border-4 border-white/5" />
                                        <div className="absolute inset-0 rounded-full border-4 border-t-white animate-spin" />
                                    </div>
                                </div>

                                <div className="space-y-1 sm:space-y-2">
                                    <h2 className="text-lg sm:text-xl font-bold text-white">Searching for Opponent</h2>
                                    <p className="text-xs sm:text-sm text-white/60">
                                        Matching you with an opponent...
                                    </p>
                                    <p className="text-[10px] sm:text-xs text-white/30 mt-1">
                                        This usually takes a few seconds
                                    </p>
                                </div>

                                <button
                                    onClick={handleClose}
                                    className="w-full rounded-full py-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition border border-white/10 mt-4"
                                >
                                    Cancel
                                </button>
                            </div>
                        </GlassBg>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
