"use client";

import { useAccount, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { GlassButton } from "./glass-button";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, LogOut, ChevronDown, X, Wallet } from "lucide-react";
import { useTokenBalance, useTokenDecimals, useTokenSymbol } from "@/hooks/useChessdict";
import { DEFAULT_STAKE_TOKEN } from "@/lib/contract";
import { formatUnits } from "viem";

export function ConnectWallet() {
  const { address, isConnected, connector } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnectAsync, connectors } = useDisconnect();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const [isMobile, setIsMobile] = useState(false);

  const tokenAddress = DEFAULT_STAKE_TOKEN as `0x${string}`;
  const { data: balanceRaw } = useTokenBalance(tokenAddress, address);
  const { data: decimals } = useTokenDecimals(tokenAddress);
  const { data: symbol } = useTokenSymbol(tokenAddress);

  const formattedBalance = balanceRaw !== undefined && decimals !== undefined
    ? parseFloat(formatUnits(balanceRaw as bigint, decimals as number)).toFixed(2)
    : null;

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
  }, []);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!isOpen || isMobile) return;
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
  }, [isOpen, isMobile]);

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

  // Lock body scroll when mobile bottom sheet is open
  useEffect(() => {
    if (isOpen && isMobile) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, isMobile]);

  const clearWalletPersistence = useCallback(() => {
    if (typeof window === "undefined") return;

    const clearStorage = (storage: Storage) => {
      const keysToRemove = Object.keys(storage).filter((key) => {
        return (
          key === "wagmi.store" ||
          key === "wagmi.recentConnectorId" ||
          key === "rk-latest-id" ||
          key === "rk-recent" ||
          key === "WALLETCONNECT_DEEPLINK_CHOICE" ||
          key.startsWith("wc@") ||
          key.toLowerCase().includes("walletconnect")
        );
      });

      for (const key of keysToRemove) {
        storage.removeItem(key);
      }
    };

    clearStorage(window.localStorage);
    clearStorage(window.sessionStorage);
  }, []);

  if (isConnected && address) {
    const shortenedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

    const handleProfile = () => {
      setIsOpen(false);
      router.push("/profile");
    };

    const handleDisconnect = async () => {
      setIsOpen(false);

      const activeConnectors = [...connectors];
      if (connector) {
        activeConnectors.push(connector);
      }

      const seen = new Set<string>();
      const uniqueConnectors = activeConnectors.filter((item) => {
        if (seen.has(item.uid)) return false;
        seen.add(item.uid);
        return true;
      });

      if (uniqueConnectors.length > 0) {
        await Promise.allSettled(
          uniqueConnectors.map((item) => disconnectAsync({ connector: item })),
        );
      } else {
        await disconnectAsync().catch(() => undefined);
      }

      clearWalletPersistence();
      router.refresh();
    };

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
          isMobile ? (
            /* Mobile: bottom sheet */
            <div className="fixed inset-0 z-9999">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onMouseDown={() => setIsOpen(false)}
              />
              <div
                ref={dropdownRef}
                className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-white/10 bg-[#1a1a1a] pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom duration-200"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {/* Handle bar */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="h-1 w-10 rounded-full bg-white/20" />
                </div>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <p className="text-sm font-medium text-white/60 font-mono">{shortenedAddress}</p>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {/* Balance */}
                {formattedBalance !== null && (
                  <>
                    <div className="flex items-center justify-between gap-3 px-4 py-4">
                      <span className="flex items-center gap-2 text-base text-white/50 shrink-0">
                        <Wallet className="h-5 w-5" />
                        Balance
                      </span>
                      <span className="text-base font-mono text-white whitespace-nowrap">
                        {formattedBalance} {(symbol as string) ?? ""}
                      </span>
                    </div>
                    <div className="border-t border-white/10" />
                  </>
                )}
                <button
                  onClick={handleProfile}
                  className="flex w-full items-center gap-3 px-4 py-4 text-base text-white/80 transition active:bg-white/10"
                >
                  <User className="h-5 w-5" />
                  Profile
                </button>
                <div className="border-t border-white/10" />
                <button
                  onClick={handleDisconnect}
                  className="flex w-full items-center gap-3 px-4 py-4 text-base text-red-400 transition active:bg-white/10"
                >
                  <LogOut className="h-5 w-5" />
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            /* Desktop: positioned dropdown */
            <div
              ref={dropdownRef}
              style={{ position: "fixed", top: dropdownPos.top, right: dropdownPos.right }}
              className="w-52 overflow-hidden rounded-xl border border-white/10 bg-black/90 backdrop-blur-xl shadow-2xl z-9999"
            >
              {formattedBalance !== null && (
                <>
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="flex items-center gap-2 text-sm text-white/50 shrink-0">
                      <Wallet className="h-4 w-4" />
                      Balance
                    </span>
                    <span className="text-sm font-mono text-white whitespace-nowrap">
                      {formattedBalance} {(symbol as string) ?? ""}
                    </span>
                  </div>
                  <div className="border-t border-white/10" />
                </>
              )}
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
                onClick={handleDisconnect}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm text-red-400 transition hover:bg-white/10 hover:text-red-300"
              >
                <LogOut className="h-4 w-4" />
                Disconnect
              </button>
            </div>
          ),
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
