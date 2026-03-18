"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
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
import type { StakeInfo } from "@/components/game/game-options";
import { getMemojiForAddress } from "@/lib/memoji";

export default function PlayPage() {
  const router = useRouter();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { gameMode, setGameMode, setStatus, setRoomId, setPlayerColor, setOpponent, setPlayer, setOnChainGameId } = useGameStore();
  const setWhiteTime = useGameStore((s) => s.setWhiteTime);
  const setBlackTime = useGameStore((s) => s.setBlackTime);
  const setRejoinData = useGameStore((s) => s.setRejoinData);
  const setRejoinChatMessages = useGameStore((s) => s.setRejoinChatMessages);
  const [incomingChallenge, setIncomingChallenge] = useState<string | null>(null);
  const [pendingMatch, setPendingMatch] = useState<{
    roomId: string;
    color: "white" | "black";
    opponent: string;
    playerRating: number;
    opponentRating: number;
    staked?: boolean;
    stakeToken?: string | null;
    stakeAmount?: string | null;
  } | null>(null);

  const { address, isConnected } = useAccount();
  const { socket, isConnected: isSocketConnected } = useSocket(address ?? undefined);
  const searchMemojiRef = useRef<string | null>(null);

  useEffect(() => {
    if (isConnected && address) {
      loginWithWallet(address)
        .then((result) => {
          if (result.success && result.user) {
            console.log("Logged in with wallet:", result.user);
            setPlayer({ address, rating: result.user.rating ?? 1200, memoji: getMemojiForAddress(address) });
          } else {
            console.error("Login failed:", result.error);
          }
        })
        .catch((err) => console.error("Login error:", err));
    }
  }, [isConnected, address, setPlayer]);

  useEffect(() => {
    if (!socket) return;

    socket.on('matchFound', (data: {
      roomId: string; color: "white" | "black"; opponent: string;
      playerRating: number; opponentRating: number;
      staked?: boolean;
      stakeToken?: string | null; stakeAmount?: string | null;
    }) => {
      console.log("MATCH FOUND EVENT:", data);
      setPendingMatch(data);
      setIsSearchOpen(false);
      toast.success(`Match found! You are ${data.color}`);
    });

    // Staked game: both players confirmed — game is ready
    socket.on('gameReady', (data: { roomId: string; onChainGameId?: string | null }) => {
      console.log("GAME READY EVENT:", data);
      setPendingMatch(prev => {
        if (!prev || prev.roomId !== data.roomId) return prev;
        // Store on-chain game ID for prize claiming
        if (data.onChainGameId) {
          setOnChainGameId(BigInt(data.onChainGameId));
        }
        // Auto-enter match for the creator (white) who was waiting
        setRoomId(prev.roomId);
        setPlayerColor(prev.color);
        setOpponent({ address: prev.opponent, rating: prev.opponentRating, memoji: searchMemojiRef.current ?? getMemojiForAddress(prev.opponent) });
        setPlayer({ address: address!, rating: prev.playerRating, memoji: getMemojiForAddress(address!) });
        if (!gameMode) setGameMode("online");
        setStatus("in-progress");
        router.push(`/play/game/${prev.roomId}`);
        return null;
      });
    });

    // Staked game: Player2 declined or timeout — handled by MatchFoundModal
    // (modal shows "Cancel Game & Reclaim Stake" UI, so we don't dismiss here)
    socket.on('opponentDeclinedStake', (data: { roomId: string; onChainGameId?: string }) => {
      console.log("OPPONENT DECLINED STAKE:", data);
    });

    socket.on('stakeTimeout', (data: { roomId: string; onChainGameId?: string }) => {
      console.log("STAKE TIMEOUT:", data);
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

    socket.on('gameRejoined', (data: { roomId: string; color: string; opponentAddress: string; opponentRating: number; playerRating: number; fen: string; moves: any[]; chatMessages?: { sender: string; text: string; timestamp: number }[]; whiteTime: number; blackTime: number }) => {
      console.log("GAME REJOINED EVENT:", data);
      setRoomId(data.roomId);
      setPlayerColor(data.color as "white" | "black");
      setOpponent({ address: data.opponentAddress, rating: data.opponentRating, memoji: getMemojiForAddress(data.opponentAddress) });
      if (address) setPlayer({ address, rating: data.playerRating, memoji: getMemojiForAddress(address) });
      setWhiteTime(data.whiteTime);
      setBlackTime(data.blackTime);
      setRejoinData(data.fen, data.moves);
      if (data.chatMessages?.length) {
        setRejoinChatMessages(data.chatMessages);
      }
      if (!gameMode) setGameMode("online");
      setStatus("in-progress");
      toast.success("Reconnected to your game!");
      router.push(`/play/game/${data.roomId}`);
    });

    return () => {
      socket.off('matchFound');
      socket.off('gameReady');
      socket.off('opponentDeclinedStake');
      socket.off('stakeTimeout');
      socket.off('challengeReceived');
      socket.off('challengeDeclined');
      socket.off('challengeError');
      socket.off('gameRejoined');
    };
  }, [socket, setRoomId, setPlayerColor, setOpponent, setStatus, address, setPlayer, setWhiteTime, setBlackTime, setRejoinData, setRejoinChatMessages, gameMode, setGameMode, setOnChainGameId]);

  const handleStartGame = (stakeInfo?: StakeInfo) => {
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
      if (stakeInfo) {
        socket?.emit("joinQueue", {
          userId: address,
          staked: true,
          token: stakeInfo.token,
          stakeAmount: stakeInfo.stakeAmount,
        });
      } else {
        socket?.emit("joinQueue", { userId: address });
      }
    } else if (gameMode === 'computer') {
      setPlayerColor("white");
      setOpponent({ address: 'stockfish', rating: 1500, memoji: getMemojiForAddress('stockfish') });
      setStatus("in-progress");
      console.log("computer mode started");
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-black text-white selection:bg-white/20">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black pointer-events-none" />

      {/* Main Content */}
      <div className="container relative mx-auto flex flex-1 flex-col items-center gap-6 px-3 pt-20 pb-6 sm:px-6 sm:pt-32 sm:gap-12 lg:flex-row lg:items-start lg:justify-center">
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
            memoji={searchMemojiRef.current}
            staked={pendingMatch.staked}
            stakeToken={pendingMatch.stakeToken}
            stakeAmount={pendingMatch.stakeAmount}
            roomId={pendingMatch.roomId}
            socket={socket}
            onAccept={() => {
              console.log("ACCEPTING MATCH:", {
                roomId: pendingMatch.roomId,
                color: pendingMatch.color,
                opponent: pendingMatch.opponent
              });
              setRoomId(pendingMatch.roomId);
              setPlayerColor(pendingMatch.color);
              setOpponent({ address: pendingMatch.opponent, rating: pendingMatch.opponentRating, memoji: searchMemojiRef.current ?? getMemojiForAddress(pendingMatch.opponent) });
              setPlayer({ address: address!, rating: pendingMatch.playerRating, memoji: getMemojiForAddress(address!) });
              if (!gameMode) setGameMode("online");
              setStatus("in-progress");
              setPendingMatch(null);
              router.push(`/play/game/${pendingMatch.roomId}`);
            }}
            onDecline={() => {
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
          <GameOptions onStartGame={handleStartGame} socket={socket} userId={address ?? undefined} isSocketConnected={isSocketConnected} />
        </div>
      </div>

      <OpponentSearchModal
        isOpen={isSearchOpen}
        onClose={() => {
          socket?.emit("leaveQueue");
          setIsSearchOpen(false);
        }}
        onMemojiSelected={(memoji) => {
          searchMemojiRef.current = memoji;
        }}
      />
    </main>
  );
}
