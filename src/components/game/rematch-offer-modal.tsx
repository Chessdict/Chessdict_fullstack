"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GlassBg } from "../glass-bg";

interface RematchOfferModalProps {
  isOpen: boolean;
  opponentLabel: string;
  onAccept: () => void;
  onDecline: () => void;
}

export function RematchOfferModal({
  isOpen,
  opponentLabel,
  onAccept,
  onDecline,
}: RematchOfferModalProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  if (!isOpen || !isMounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-sm animate-in zoom-in-95 duration-300">
        <GlassBg className="p-5 text-center sm:p-8" height={280}>
          <div className="flex flex-col items-center gap-4 sm:gap-6">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-linear-to-br from-emerald-500/20 to-blue-500/20 shadow-xl shadow-emerald-500/10 sm:h-20 sm:w-20">
                <svg className="h-8 w-8 text-emerald-300 sm:h-10 sm:w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 12h8m-8 5h8M5 7h.01M5 12h.01M5 17h.01" />
                </svg>
              </div>
            </div>

            <div className="space-y-1 sm:space-y-2">
              <h2 className="text-lg font-bold text-white sm:text-xl">Rematch Requested</h2>
              <p className="text-xs text-white/60 sm:text-sm">
                {opponentLabel} wants to play again. Do you want a rematch?
              </p>
            </div>

            <div className="mt-2 flex w-full gap-3 sm:mt-4">
              <button
                onClick={onDecline}
                className="flex-1 rounded-full border border-white/10 py-3 text-sm font-medium text-white/60 transition hover:bg-white/5 hover:text-white"
              >
                Decline
              </button>
              <button
                onClick={onAccept}
                className="group relative flex-1 overflow-hidden rounded-full py-3 transition-transform active:scale-95"
              >
                <div className="absolute inset-0 bg-linear-to-r from-emerald-600 to-blue-600 opacity-90 transition-opacity group-hover:opacity-100" />
                <span className="relative text-sm font-bold text-white">Accept Rematch</span>
              </button>
            </div>
          </div>
        </GlassBg>
      </div>
    </div>,
    document.body
  );
}
