"use client";

import { useEffect, useState } from "react";
import { GameBoard } from "../../components/game/game-board";
import { GameOptions } from "../../components/game/game-options";
import { OpponentSearchModal } from "../../components/game/opponent-search-modal";
import { useGameStore } from "@/stores/game-store";
import { useSocket } from '@/hooks/useSocket';
import { useAccount } from "wagmi";
import { loginWithWallet } from "../actions";
import { searchUsers } from "@/app/actions";
import { ChallengeModal } from "@/components/game/challenge-modal";
import { MatchFoundModal } from "@/components/game/match-found-modal";
import { toast } from "sonner";

export default function PlayPage() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { gameMode, setGameMode, setStatus, setRoomId, setPlayerColor, setOpponent, setPlayer } = useGameStore();
  const [incomingChallenge, setIncomingChallenge] = useState<string | null>(null);
  const [pendingMatch, setPendingMatch] = useState<{ roomId: string, color: "white" | "black", opponent: string } | null>(null);

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
      console.log("MATCH FOUND EVENT:", data);
      setPendingMatch(data);
      setIsSearchOpen(false);
      toast.success(`Match found! You are ${data.color}`);
    });

    socket.on('challengeReceived', (data: { from: string }) => {
      setIncomingChallenge(data.from);
    });

    socket.on('challengeDeclined', (data: { from: string }) => {
      toast.error(`Challenge declined by ${data.from.slice(0, 6)}...`);
    });

    socket.on('challengeError', (data: { error: string }) => {
      toast.error(data.error);
    });

    return () => {
      socket.off('matchFound');
      socket.off('challengeReceived');
      socket.off('challengeDeclined');
      socket.off('challengeError');
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
      setPlayerColor("white");
      setStatus("in-progress");
      console.log("computer mode started");
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-black text-white selection:bg-white/20">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black pointer-events-none" />

      {/* Main Content */}
      <div className="container relative mx-auto flex flex-1 flex-col items-start gap-12 px-6 pt-32 pb-6 lg:flex-row lg:justify-center">
        {incomingChallenge && (
          <ChallengeModal
            from={incomingChallenge}
            onAccept={() => {
              socket?.emit('acceptChallenge', { opponentId: incomingChallenge, userId: address });
              setIncomingChallenge(null);
            }}
            onDecline={() => {
              socket?.emit('declineChallenge', { toUserId: incomingChallenge, fromUserId: address });
              setIncomingChallenge(null);
            }}
          />
        )}

        {pendingMatch && (
          <MatchFoundModal
            opponent={pendingMatch.opponent}
            color={pendingMatch.color}
            onAccept={() => {
              console.log("ACCEPTING MATCH:", {
                roomId: pendingMatch.roomId,
                color: pendingMatch.color,
                opponent: pendingMatch.opponent
              });
              setRoomId(pendingMatch.roomId);
              setPlayerColor(pendingMatch.color);
              setOpponent({ address: pendingMatch.opponent, rating: 1200 });
              setPlayer({ address: address!, rating: 1200 });
              // Ensure gameMode is set to online if it was null (e.g. from a challenge)
              if (!gameMode) setGameMode("online");
              setStatus("in-progress");
              setPendingMatch(null);
            }}
          />
        )}
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
