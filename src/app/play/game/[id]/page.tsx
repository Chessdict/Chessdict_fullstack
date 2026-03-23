"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { GameBoard } from "@/components/game/game-board";
import { GameInfoPanel } from "@/components/game/game-info-panel";
import { useGameStore } from "@/stores/game-store";
import { useSocket } from "@/hooks/useSocket";
import { useAccount } from "wagmi";
import { loginWithWallet } from "@/app/actions";
import { toast } from "sonner";
import { getMemojiForAddress } from "@/lib/memoji";

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
  } = useGameStore();
  const setWhiteTime = useGameStore((s) => s.setWhiteTime);
  const setBlackTime = useGameStore((s) => s.setBlackTime);
  const setRejoinData = useGameStore((s) => s.setRejoinData);
  const setRejoinChatMessages = useGameStore((s) => s.setRejoinChatMessages);

  // Login with wallet on mount
  useEffect(() => {
    if (isConnected && address) {
      loginWithWallet(address)
        .then((result) => {
          if (result.success && result.user) {
            setPlayer({ address, rating: result.user.rating ?? 1200, memoji: getMemojiForAddress(address) });
          }
        })
        .catch(console.error);
    }
  }, [isConnected, address, setPlayer]);

  // Effect 1: Always listen for gameRejoined (survives socket reconnections)
  // This listener persists because it only depends on socket & gameId (not isSocketConnected)
  useEffect(() => {
    if (!socket || !gameId) return;

    const handleGameRejoined = (data: {
      roomId: string;
      color: string;
      opponentAddress: string;
      opponentRating: number;
      playerRating: number;
      fen: string;
      moves: any[];
      chatMessages?: { sender: string; text: string; timestamp: number }[];
      whiteTime: number;
      blackTime: number;
      onChainGameId?: string | null;
      stakeToken?: string | null;
      stakeAmount?: string | null;
    }) => {
      if (roomId !== data.roomId || status !== "in-progress") {
        clearMatchState();
      }
      setOnChainGameId(data.onChainGameId ? BigInt(data.onChainGameId) : null);
      setStakeToken(data.stakeToken ?? null);
      setStakeAmountRaw(data.stakeAmount ?? null);
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
    };

    socket.on("gameRejoined", handleGameRejoined);
    return () => {
      socket.off("gameRejoined", handleGameRejoined);
    };
  }, [socket, gameId, address, gameMode, roomId, status, clearMatchState, setRoomId, setPlayerColor, setOpponent, setPlayer, setWhiteTime, setBlackTime, setRejoinData, setRejoinChatMessages, setGameMode, setOnChainGameId, setStakeAmountRaw, setStakeToken, setStatus]);

  // Effect 2: Emit rejoinGame on initial page load AND on every socket reconnection
  // This ensures we always get fresh game state + chat even after tab close/reopen
  useEffect(() => {
    if (!socket || !gameId) return;

    const emitRejoin = () => {
      socket.emit("rejoinGame", { roomId: gameId });
    };

    const handleRejoinError = () => {
      toast.error("No active game found. Redirecting...");
      router.push("/play");
    };

    socket.on("rejoinError", handleRejoinError);

    // Emit immediately if connected, AND on every future reconnect
    if (socket.connected) {
      emitRejoin();
    }
    socket.on("connect", emitRejoin);

    return () => {
      socket.off("connect", emitRejoin);
      socket.off("rejoinError", handleRejoinError);
    };
  }, [socket, gameId, router]);

  return (
    <main className="flex min-h-screen flex-col bg-black text-white selection:bg-white/20">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black pointer-events-none" />

      <div className="container relative mx-auto flex flex-1 flex-col items-center gap-6 px-3 pb-6 sm:px-6 sm:gap-12 lg:flex-row lg:items-start lg:justify-center">
        {/* Chess Board */}
        <div className="w-full max-w-[720px] flex-none">
          <GameBoard />
        </div>

        {/* Game Info Panel */}
        <div className="w-full max-w-sm flex-none">
          <GameInfoPanel isSocketConnected={isSocketConnected} />
        </div>
      </div>
    </main>
  );
}
