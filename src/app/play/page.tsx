"use client";

import { useEffect, useState } from "react";
import { GameBoard } from "../../components/game/game-board";
import { GameOptions } from "../../components/game/game-options";
import { OpponentSearchModal } from "../../components/game/opponent-search-modal";
import { useGameStore } from "@/stores/game-store";
import { useSocket } from '@/hooks/useSocket';
import { useAccount } from "wagmi";
import { loginWithWallet } from "../actions";
import { toast } from "sonner";

export default function PlayPage() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { gameMode, setStatus } = useGameStore();

  const { socket, isConnected: isSocketConnected } = useSocket();
  const { address, isConnected } = useAccount();


  useEffect(() => {
    if (isConnected && address) {
      loginWithWallet(address)
        .then((result) => {
          if (result.success) {
            console.log("Logged in with wallet:", result.user);
          } else {
            console.error("Login failed:", result.error);
          }
        })
        .catch((err) => console.error("Login error:", err));
    }
  }, [isConnected, address]);

  useEffect(() => {
    if (!socket) return;

    socket.on('message', (data) => {
      console.log(data);
    });

    return () => {
      socket.off('message');
    };
  }, [socket]);


  const handleStartGame = () => {
    if (!isConnected) {
      toast.error("Please connect your wallet to play!");
      return;
    }

    if (gameMode === 'online') {
      setIsSearchOpen(true);
      // Simulate finding match after 3s
      setTimeout(() => {
        setIsSearchOpen(false);
        setStatus("in-progress");
      }, 3000);
    } else if (gameMode === 'computer') {
      setStatus("in-progress");
      console.log("computer")
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-black text-white selection:bg-white/20">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black pointer-events-none" />

      {/* Main Content */}
      <div className="container relative mx-auto flex flex-1 flex-col items-start gap-12 px-6 pt-32 pb-6 lg:flex-row lg:justify-center">
        {/* Left Panel - Chess Board */}
        <div className="w-full max-w-[720px] flex-none">
          <GameBoard />
        </div>

        {/* Right Panel - Game Options */}
        <div className="w-full max-w-sm flex-none">
          <GameOptions onStartGame={handleStartGame} />
        </div>
      </div>

      <OpponentSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </main>
  );
}
