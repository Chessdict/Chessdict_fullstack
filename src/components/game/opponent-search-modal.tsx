"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";

interface OpponentSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const mockOpponents = [
    { id: 1, name: "Ezeugwu Romanus", address: "CTYZ..ZgXe", avatar: "/images/king_pin.svg" }, // using placeholder avatar
    { id: 2, name: "Ezeugwu Romanus", address: "CTYZ..2gXs", avatar: "/images/king_pin.svg" },
    { id: 3, name: "Ezeugwu Romanus", address: "CTYZ..2gXe", avatar: "/images/king_pin.svg" },
    { id: 4, name: "Ezeugwu Romanus", address: "CTYZ..2gXe", avatar: "/images/king_pin.svg" },
    { id: 5, name: "Ezeugwu Romanus", address: "CTYZ..2gXs", avatar: "/images/king_pin.svg" },
];

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
                            <h2 className="text-lg font-medium text-white">Search for opponents</h2>
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
                            <button
                                className="absolute left-6 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                            >
                                {/* Help Icon placeholder if needed */}
                                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-xs">?</span>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex flex-col p-2">
                            <div className="flex justify-center py-4">
                                <div className="animate-spin text-white">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                                </div>
                            </div>

                            <div className="flex max-h-[300px] flex-col gap-1 overflow-y-auto px-2 pb-4">
                                {mockOpponents.map((opponent, index) => (
                                    <button
                                        key={`${opponent.id}-${index}`}
                                        className="flex items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-white/5"
                                    >
                                        <div className="relative h-10 w-10 overflow-hidden rounded-full bg-red-400">
                                            {/* Avatar placeholder - colored bg if image fails */}
                                            <Image
                                                src={opponent.avatar}
                                                alt={opponent.name}
                                                fill
                                                className="object-cover"
                                                onError={(e) => {
                                                    // Fallback logic could go here, but purely CSS/div based fallback is safer for now if image missing
                                                    const target = e.target as HTMLImageElement;
                                                    target.style.display = 'none';
                                                }}
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-white">{opponent.name}</span>
                                            <span className="text-xs text-white/40">{opponent.address}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
