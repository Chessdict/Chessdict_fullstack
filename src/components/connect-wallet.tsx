"use client";

import { useAccount, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { GlassButton } from "./glass-button";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { User, LogOut, ChevronDown } from "lucide-react";

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, updatePosition]);

  if (isConnected && address) {
    const shortenedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return (
      <div ref={buttonRef}>
        <GlassButton onClick={() => setIsOpen(!isOpen)} className="text-xs sm:text-sm">
          <span className="flex items-center gap-1.5">
            {shortenedAddress}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            />
          </span>
        </GlassButton>

        {isOpen && createPortal(
          <div
            ref={dropdownRef}
            style={{ position: "fixed", top: dropdownPos.top, right: dropdownPos.right }}
            className="w-48 overflow-hidden rounded-xl border border-white/10 bg-black/90 backdrop-blur-xl shadow-2xl z-[9999]"
          >
            <Link
              href="/profile"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <User className="h-4 w-4" />
              Profile
            </Link>
            <div className="border-t border-white/10" />
            <button
              onClick={() => {
                disconnect();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-red-400 transition hover:bg-white/10 hover:text-red-300"
            >
              <LogOut className="h-4 w-4" />
              Disconnect
            </button>
          </div>,
          document.body
        )}
      </div>
    );
  }

  return (
    <GlassButton onClick={openConnectModal} className="text-xs sm:text-sm cursor-pointer">
      Connect wallet
    </GlassButton>
  );
}
