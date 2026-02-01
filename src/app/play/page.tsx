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
  const { gameMode, setStatus, setRoomId, setPlayerColor, setOpponent } = useGameStore();
  const { address, isConnected } = useAccount();
  const { socket, isConnected: isSocketConnected } = useSocket(address ?? undefined);

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

    socket.on('matchFound', (data: { roomId: string, color: "white" | "black", opponent: string }) => {
      setRoomId(data.roomId);
      setPlayerColor(data.color);
      setOpponent({ address: data.opponent, rating: 1200 });
      setIsSearchOpen(false);
      setStatus("in-progress");
      toast.success(`Match found! You are playing as ${data.color}`);
    });

    socket.on('challengeReceived', (data: { from: string }) => {
      toast(`Incoming challenge from ${data.from.slice(0, 6)}...`, {
        action: {
          label: 'Accept',
          onClick: () => {
            socket.emit('acceptChallenge', { opponentId: data.from, userId: address });
          },
        },
        duration: 10000,
      });
    });

    return () => {
      socket.off('matchFound');
      socket.off('challengeReceived');
    };
  }, [socket, setRoomId, setPlayerColor, setOpponent, setStatus, address]);

  const handleStartGame = () => {
    if (!isConnected) {
      toast.error("Please connect your wallet to play!");
      return;
    }

    if (gameMode === 'online') {
      if (!isSocketConnected) {
        toast.error("Socket not connected. Please try again.");
        return;
      }
      setIsSearchOpen(true);
      socket?.emit("joinQueue", { userId: address });
    } else if (gameMode === 'computer') {
      setStatus("in-progress");
      console.log("computer mode started");
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
          <GameOptions onStartGame={handleStartGame} socket={socket} userId={address ?? undefined} />
        </div>
      </div>

      <OpponentSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </main>
  );
}
