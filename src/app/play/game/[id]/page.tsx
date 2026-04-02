"use client";

import { useEffect, use, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GameBoard } from "@/components/game/game-board";
import { GameInfoPanel } from "@/components/game/game-info-panel";
import { useGameStore } from "@/stores/game-store";
import { useSocket } from "@/hooks/useSocket";
import { useAccount } from "wagmi";
import { loginWithWallet } from "@/app/actions";
import { toast } from "sonner";
import { getMemojiForAddress } from "@/lib/memoji";
import { getPlayerRatingForTimeControl } from "@/lib/player-ratings";
import {
  DEFAULT_QUEUE_TIME_CONTROL_MINUTES,
  getTimeControlSeconds,
  normalizeTimeControlMinutes,
} from "@/lib/time-control";

export default function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: gameId } = use(params);
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { socket, isConnected: isSocketConnected } = useSocket(
    address ?? undefined,
  );

  const {
    status,
    gameMode,
    roomId,
    setStatus,
    setRoomId,
    setPlayerColor,
    setOpponent,
    setPlayer,
    setGameMode,
    setOnChainGameId,
    setStakeToken,
    setStakeAmountRaw,
    clearMatchState,
    setOpponentConnected,
  } = useGameStore();
  const setWhiteTime = useGameStore((s) => s.setWhiteTime);
  const setBlackTime = useGameStore((s) => s.setBlackTime);
  const setRejoinData = useGameStore((s) => s.setRejoinData);
  const setRejoinChatMessages = useGameStore((s) => s.setRejoinChatMessages);
  const setInitialTime = useGameStore((s) => s.setInitialTime);
  const setClockConfig = useGameStore((s) => s.setClockConfig);
  const setOpponentDisconnectDeadline = useGameStore((s) => s.setOpponentDisconnectDeadline);
  const setSelfDisconnectDeadline = useGameStore((s) => s.setSelfDisconnectDeadline);
  const initialRejoinRequestedRef = useRef(false);
  const roomAccessRecoveryRef = useRef<number>(0);
  const [initialRoomStateResolved, setInitialRoomStateResolved] = useState(
    roomId === gameId && status === "in-progress",
  );
  const isStoreReadyForCurrentGame = roomId === gameId && status === "in-progress";

  const enterMatchedGame = useCallback((data: {
    roomId: string;
    color: string;
    opponent: string;
    opponentName?: string | null;
    playerName?: string | null;
    opponentRating: number;
    playerRating: number;
    timeControl?: number;
  }) => {
    const timeControlMinutes = normalizeTimeControlMinutes(data.timeControl);
    const initialSeconds = getTimeControlSeconds(timeControlMinutes);

    if (socket && roomId) {
      socket.emit("leaveRoom", { roomId });
    }

    clearMatchState();
    setInitialTime(initialSeconds);
    setOnChainGameId(null);
    setStakeToken(null);
    setStakeAmountRaw(null);
    setRoomId(data.roomId);
    setPlayerColor(data.color as "white" | "black");
    setOpponent({
      address: data.opponent,
      username: data.opponentName ?? null,
      rating: data.opponentRating,
      memoji: getMemojiForAddress(data.opponent),
    });
    if (address) {
      setPlayer({
        address,
        username: data.playerName ?? null,
        rating: data.playerRating,
        memoji: getMemojiForAddress(address),
      });
    }
    if (!gameMode) setGameMode("online");
    setStatus("in-progress");
    router.push(`/play/game/${data.roomId}`);
  }, [address, clearMatchState, gameMode, roomId, router, setGameMode, setInitialTime, setOnChainGameId, setOpponent, setPlayer, setPlayerColor, setRoomId, setStakeAmountRaw, setStakeToken, setStatus, socket]);

  // Login with wallet on mount
  useEffect(() => {
    if (isConnected && address) {
      loginWithWallet(address)
        .then((result) => {
          if (result.success && result.user) {
            setPlayer({
              address,
              username: result.user.username ?? null,
              rating: getPlayerRatingForTimeControl(
                result.user,
                DEFAULT_QUEUE_TIME_CONTROL_MINUTES,
              ),
              memoji: getMemojiForAddress(address),
            });
          }
        })
        .catch(console.error);
    }
  }, [isConnected, address, setPlayer]);

  useEffect(() => {
    initialRejoinRequestedRef.current = false;
    setInitialRoomStateResolved(roomId === gameId && status === "in-progress");
  }, [gameId]);

  useEffect(() => {
    if (isStoreReadyForCurrentGame) {
      setInitialRoomStateResolved(true);
    }
  }, [isStoreReadyForCurrentGame]);

  // Effect 1: Always listen for gameRejoined (survives socket reconnections)
  // This listener persists because it only depends on socket & gameId (not isSocketConnected)
  useEffect(() => {
    if (!socket || !gameId) return;

    const handleMatchFound = (data: {
      roomId: string;
      color: string;
      opponent: string;
      opponentRating: number;
      playerRating: number;
      timeControl?: number;
    }) => {
      enterMatchedGame(data);
    };

    const handleGameRejoined = (data: {
      roomId: string;
      color: string;
      opponentAddress: string;
      opponentName?: string | null;
      playerName?: string | null;
      opponentRating: number;
      playerRating: number;
      fen: string;
      moves: any[];
      chatMessages?: { sender: string; text: string; timestamp: number }[];
      whiteTime: number;
      blackTime: number;
      timeControl?: number;
      onChainGameId?: string | null;
      stakeToken?: string | null;
      stakeAmount?: string | null;
      disconnectGrace?: {
        deadline: number;
        disconnectedWallets: string[];
        turn: "w" | "b";
        bothDisconnected?: boolean;
      } | null;
    }) => {
      if (roomId !== data.roomId || status !== "in-progress") {
        clearMatchState();
      }
      const timeControlMinutes = normalizeTimeControlMinutes(
        data.timeControl ?? Math.ceil(Math.max(data.whiteTime, data.blackTime) / 60),
      );
      const initialSeconds = getTimeControlSeconds(timeControlMinutes);
      setClockConfig(initialSeconds);
      setOnChainGameId(data.onChainGameId ? BigInt(data.onChainGameId) : null);
      setStakeToken(data.stakeToken ?? null);
      setStakeAmountRaw(data.stakeAmount ?? null);
      setRoomId(data.roomId);
      setPlayerColor(data.color as "white" | "black");
      setOpponent({ address: data.opponentAddress, username: data.opponentName ?? null, rating: data.opponentRating, memoji: getMemojiForAddress(data.opponentAddress) });
      if (address) setPlayer({ address, username: data.playerName ?? null, rating: data.playerRating, memoji: getMemojiForAddress(address) });
      setWhiteTime(Math.min(data.whiteTime, initialSeconds));
      setBlackTime(Math.min(data.blackTime, initialSeconds));
      setRejoinData(data.fen, data.moves);
      if (data.chatMessages?.length) {
        setRejoinChatMessages(data.chatMessages);
      }
      const normalizedAddress = address?.toLowerCase() ?? null;
      const disconnectedWallets = (data.disconnectGrace?.disconnectedWallets ?? []).map((wallet) =>
        wallet.toLowerCase(),
      );
      const selfDisconnected = normalizedAddress
        ? disconnectedWallets.includes(normalizedAddress)
        : false;
      const opponentDisconnected = normalizedAddress
        ? disconnectedWallets.some((wallet) => wallet !== normalizedAddress)
        : disconnectedWallets.length > 0;
      setSelfDisconnectDeadline(selfDisconnected ? data.disconnectGrace?.deadline ?? null : null);
      setOpponentDisconnectDeadline(opponentDisconnected ? data.disconnectGrace?.deadline ?? null : null);
      setOpponentConnected(!opponentDisconnected);
      if (!gameMode) setGameMode("online");
      setStatus("in-progress");
      setInitialRoomStateResolved(true);
    };

    socket.on("matchFound", handleMatchFound);
    socket.on("gameRejoined", handleGameRejoined);
    return () => {
      socket.off("matchFound", handleMatchFound);
      socket.off("gameRejoined", handleGameRejoined);
    };
  }, [socket, gameId, address, gameMode, roomId, status, clearMatchState, enterMatchedGame, router, setRoomId, setPlayerColor, setOpponent, setPlayer, setWhiteTime, setBlackTime, setRejoinData, setRejoinChatMessages, setGameMode, setOnChainGameId, setStakeAmountRaw, setStakeToken, setStatus, setClockConfig, setOpponentConnected, setOpponentDisconnectDeadline, setSelfDisconnectDeadline]);

  // Request one authoritative rejoin for this page load.
  // Subsequent socket reconnects are handled by the server auto-rejoin path.
  useEffect(() => {
    if (!socket || !gameId) return;

    const emitRejoin = () => {
      if (initialRejoinRequestedRef.current) return;
      initialRejoinRequestedRef.current = true;
      socket.emit("rejoinGame", { roomId: gameId });
    };

    const handleRejoinError = () => {
      setInitialRoomStateResolved(true);
      toast.error("No active game found. Redirecting...");
      router.push("/play");
    };

    const handleRoomAccessDenied = ({ event }: { event?: string }) => {
      const now = Date.now();
      if (now - roomAccessRecoveryRef.current < 1500) return;
      roomAccessRecoveryRef.current = now;

      if (event === "movePiece" || event === "requestGameSnapshot" || event === "joinRoom") {
        socket.emit("rejoinGame", { roomId: gameId });
      }
    };

    socket.on("rejoinError", handleRejoinError);
    socket.on("roomAccessDenied", handleRoomAccessDenied);

    if (socket.connected) {
      emitRejoin();
    } else {
      socket.once("connect", emitRejoin);
    }

    return () => {
      socket.off("connect", emitRejoin);
      socket.off("rejoinError", handleRejoinError);
      socket.off("roomAccessDenied", handleRoomAccessDenied);
    };
  }, [socket, gameId, router]);

  return (
    <main className="flex min-h-screen flex-col bg-black text-white selection:bg-white/20">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black pointer-events-none" />

      <div className="container relative mx-auto flex flex-1 flex-col items-center gap-2 px-0 pb-3 sm:px-6 sm:gap-12 sm:pb-6 lg:flex-row lg:items-start lg:justify-center">
        {initialRoomStateResolved ? (
          <>
            {/* Chess Board */}
            <div className="w-full max-w-none flex-none px-0 sm:max-w-[760px] sm:px-0">
              <GameBoard />
            </div>

            {/* Game Info Panel */}
            <div className="w-full max-w-none flex-none px-0 sm:max-w-sm sm:px-0">
              <GameInfoPanel isSocketConnected={isSocketConnected} />
            </div>
          </>
        ) : (
          <div className="flex w-full max-w-3xl flex-col items-center justify-center gap-4 rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-20 text-center backdrop-blur-sm">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <div>
              <p className="text-sm font-medium text-white/80">Restoring game</p>
              <p className="mt-1 text-sm text-white/45">Syncing the latest board and clocks.</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
