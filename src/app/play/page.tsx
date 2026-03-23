"use client";

import { useCallback, useEffect, useState, useRef } from "react";
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
import {
  clampStakedTimeControlMinutes,
  DEFAULT_QUEUE_TIME_CONTROL_MINUTES,
  getTimeControlSeconds,
  normalizeTimeControlMinutes,
} from "@/lib/time-control";

type PendingMatch = {
  roomId: string;
  color: "white" | "black";
  opponent: string;
  playerRating: number;
  opponentRating: number;
  timeControl: number;
  staked?: boolean;
  stakeToken?: string | null;
  stakeAmount?: string | null;
};

type IncomingChallenge = {
  from: string;
  stakeEnabled?: boolean;
  stakeToken?: string | null;
  stakeAmount?: string | null;
  timeControl?: number;
};

export default function PlayPage() {
  const router = useRouter();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const {
    status,
    roomId,
    gameMode,
    setGameMode,
    setStatus,
    setRoomId,
    setPlayerColor,
    setOpponent,
    setPlayer,
    setOnChainGameId,
    setStakeToken,
    setStakeAmountRaw,
    clearMatchState,
  } = useGameStore();
  const setWhiteTime = useGameStore((s) => s.setWhiteTime);
  const setBlackTime = useGameStore((s) => s.setBlackTime);
  const setRejoinData = useGameStore((s) => s.setRejoinData);
  const setRejoinChatMessages = useGameStore((s) => s.setRejoinChatMessages);
  const [incomingChallenge, setIncomingChallenge] = useState<IncomingChallenge | null>(null);
  const [pendingMatch, setPendingMatch] = useState<PendingMatch | null>(null);

  const { address, isConnected } = useAccount();
  const { socket, isConnected: isSocketConnected } = useSocket(address ?? undefined);
  const searchMemojiRef = useRef<string | null>(null);
  const selectedTimeRef = useRef<number>(DEFAULT_QUEUE_TIME_CONTROL_MINUTES);
  const hasHandledAutoActionRef = useRef(false);
  const setInitialTime = useGameStore((s) => s.setInitialTime);

  const enterMatchedGame = useCallback((match: PendingMatch, options?: { onChainGameId?: bigint | null }) => {
    if (!address) return;

    const timeControlMinutes = normalizeTimeControlMinutes(match.timeControl);
    clearMatchState();
    setInitialTime(getTimeControlSeconds(timeControlMinutes));
    if (options?.onChainGameId !== undefined) {
      setOnChainGameId(options.onChainGameId);
    }
    setStakeToken(match.staked ? (match.stakeToken ?? null) : null);
    setStakeAmountRaw(match.staked ? (match.stakeAmount ?? null) : null);
    setRoomId(match.roomId);
    setPlayerColor(match.color);
    setOpponent({
      address: match.opponent,
      rating: match.opponentRating,
      memoji: searchMemojiRef.current ?? getMemojiForAddress(match.opponent),
    });
    setPlayer({
      address,
      rating: match.playerRating,
      memoji: getMemojiForAddress(address),
    });
    if (!gameMode) setGameMode("online");
    setStatus("in-progress");
    setPendingMatch(null);
    router.push(`/play/game/${match.roomId}`);
  }, [address, clearMatchState, gameMode, router, setGameMode, setInitialTime, setOnChainGameId, setOpponent, setPlayer, setPlayerColor, setRoomId, setStakeAmountRaw, setStakeToken, setStatus]);

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
    if (hasHandledAutoActionRef.current) return;

    const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
    const autoQueue = params?.get("autoQueue");
    if (autoQueue !== "online") return;
    if (!address || !socket || !isSocketConnected) return;

    const timeControlMinutes = normalizeTimeControlMinutes(
      params?.get("timeControl") ?? DEFAULT_QUEUE_TIME_CONTROL_MINUTES,
    );
    hasHandledAutoActionRef.current = true;
    selectedTimeRef.current = timeControlMinutes;
    setInitialTime(getTimeControlSeconds(timeControlMinutes));
    setGameMode("online");
    setIsSearchOpen(true);
    socket.emit("joinQueue", { userId: address, timeControl: timeControlMinutes });
    router.replace("/play");
  }, [address, isSocketConnected, router, setGameMode, setInitialTime, socket]);

  useEffect(() => {
    if (!socket) return;

    socket.on('matchFound', (data: PendingMatch) => {
      console.log("MATCH FOUND EVENT:", data);
      setIsSearchOpen(false);
      toast.success(`Match found! You are ${data.color}`);

      setPendingMatch({
        ...data,
        timeControl: normalizeTimeControlMinutes(data.timeControl),
      });
    });

    // Staked game: both players confirmed — game is ready
    socket.on('gameReady', (data: { roomId: string; onChainGameId?: string | null; timeControl?: number }) => {
      console.log("GAME READY EVENT:", data);
      setPendingMatch(prev => {
        if (!prev || prev.roomId !== data.roomId) return prev;
        enterMatchedGame({
          ...prev,
          timeControl: normalizeTimeControlMinutes(data.timeControl ?? prev.timeControl),
        }, {
          onChainGameId: data.onChainGameId ? BigInt(data.onChainGameId) : null,
        });
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

    socket.on('challengeReceived', (data: IncomingChallenge) => {
      setIncomingChallenge({
        ...data,
        timeControl: data.stakeEnabled
          ? clampStakedTimeControlMinutes(data.timeControl)
          : normalizeTimeControlMinutes(data.timeControl),
      });
    });

    socket.on('challengeDeclined', (data: { from: string }) => {
      toast.error(`Challenge declined by ${data.from.slice(0, 6)}...`);
    });

    socket.on('challengeError', (data: { error: string }) => {
      toast.error(data.error);
    });

    socket.on('gameRejoined', (data: { roomId: string; color: string; opponentAddress: string; opponentRating: number; playerRating: number; fen: string; moves: any[]; chatMessages?: { sender: string; text: string; timestamp: number }[]; whiteTime: number; blackTime: number; timeControl?: number; onChainGameId?: string | null; stakeToken?: string | null; stakeAmount?: string | null }) => {
      console.log("GAME REJOINED EVENT:", data);
      if (roomId !== data.roomId || status !== "in-progress") {
        clearMatchState();
      }
      const timeControlMinutes = normalizeTimeControlMinutes(
        data.timeControl ?? Math.ceil(Math.max(data.whiteTime, data.blackTime) / 60),
      );
      const initialSeconds = getTimeControlSeconds(timeControlMinutes);
      selectedTimeRef.current = timeControlMinutes;
      setInitialTime(initialSeconds);
      setOnChainGameId(data.onChainGameId ? BigInt(data.onChainGameId) : null);
      setStakeToken(data.stakeToken ?? null);
      setStakeAmountRaw(data.stakeAmount ?? null);
      setRoomId(data.roomId);
      setPlayerColor(data.color as "white" | "black");
      setOpponent({ address: data.opponentAddress, rating: data.opponentRating, memoji: getMemojiForAddress(data.opponentAddress) });
      if (address) setPlayer({ address, rating: data.playerRating, memoji: getMemojiForAddress(address) });
      setWhiteTime(Math.min(data.whiteTime, initialSeconds));
      setBlackTime(Math.min(data.blackTime, initialSeconds));
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
  }, [socket, status, roomId, setRoomId, setPlayerColor, setOpponent, setStatus, address, setPlayer, setWhiteTime, setBlackTime, setRejoinData, setRejoinChatMessages, gameMode, setGameMode, setOnChainGameId, setStakeAmountRaw, setStakeToken, enterMatchedGame, clearMatchState, setInitialTime]);

  const handleStartGame = (stakeInfo?: StakeInfo, timeControl?: number) => {
    if (!isConnected) {
      toast.error("Please connect your wallet to play!");
      return;
    }

    const timeMinutes = normalizeTimeControlMinutes(timeControl ?? DEFAULT_QUEUE_TIME_CONTROL_MINUTES);
    selectedTimeRef.current = timeMinutes;
    setInitialTime(getTimeControlSeconds(timeMinutes));

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
          timeControl: timeMinutes,
        });
      } else {
        socket?.emit("joinQueue", { userId: address, timeControl: timeMinutes });
      }
    } else if (gameMode === 'computer') {
      clearMatchState();
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
      <div className="container relative mx-auto flex flex-1 flex-col items-center gap-6 px-3 pb-6 sm:px-6 sm:gap-12 lg:flex-row lg:items-start">
        {incomingChallenge && (
          <ChallengeModal
            from={incomingChallenge.from}
            stakeEnabled={incomingChallenge.stakeEnabled}
            timeControl={incomingChallenge.timeControl}
            onAccept={() => {
              socket?.emit('acceptChallenge', {
                opponentId: incomingChallenge.from,
                userId: address,
                stakeEnabled: incomingChallenge.stakeEnabled,
                timeControl: incomingChallenge.timeControl,
              });
              setIncomingChallenge(null);
            }}
            onDecline={() => {
              socket?.emit('declineChallenge', { toUserId: incomingChallenge.from, fromUserId: address });
              setIncomingChallenge(null);
            }}
          />
        )}

        {pendingMatch && (
          <MatchFoundModal
            opponent={pendingMatch.opponent}
            color={pendingMatch.color}
            memoji={searchMemojiRef.current}
            autoEnter={!pendingMatch.staked}
            staked={pendingMatch.staked}
            stakeToken={pendingMatch.stakeToken}
            stakeAmount={pendingMatch.stakeAmount}
            timeControl={pendingMatch.timeControl}
            roomId={pendingMatch.roomId}
            socket={socket}
            onAccept={() => {
              console.log("ACCEPTING MATCH:", {
                roomId: pendingMatch.roomId,
                color: pendingMatch.color,
                opponent: pendingMatch.opponent
              });
              enterMatchedGame(pendingMatch);
            }}
            onDecline={() => {
              setPendingMatch(null);
            }}
          />
        )}
        {/* Left Panel - Chess Board */}
        <div className="w-full max-w-[720px]">
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
