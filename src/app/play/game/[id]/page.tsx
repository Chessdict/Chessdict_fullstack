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
  } = useGameStore();
  const setWhiteTime = useGameStore((s) => s.setWhiteTime);
  const setBlackTime = useGameStore((s) => s.setBlackTime);
  const setRejoinData = useGameStore((s) => s.setRejoinData);

  // Login with wallet on mount
  useEffect(() => {
    if (isConnected && address) {
      loginWithWallet(address)
        .then((result) => {
          if (result.success && result.user) {
            setPlayer({ address, rating: result.user.rating ?? 1200 });
          }
        })
        .catch(console.error);
    }
  }, [isConnected, address, setPlayer]);

  // If game is already loaded in store (navigated from play page), no need to rejoin
  // Otherwise, emit rejoinGame to restore state from server
  useEffect(() => {
    if (!socket || !isSocketConnected || !gameId) return;
    // Already loaded (came from play page with state set)
    if (roomId === gameId && status === "in-progress") return;

    const handleGameRejoined = (data: {
      roomId: string;
      color: string;
      opponentAddress: string;
      opponentRating: number;
      playerRating: number;
      fen: string;
      moves: any[];
      whiteTime: number;
      blackTime: number;
    }) => {
      setRoomId(data.roomId);
      setPlayerColor(data.color as "white" | "black");
      setOpponent({ address: data.opponentAddress, rating: data.opponentRating });
      if (address) setPlayer({ address, rating: data.playerRating });
      setWhiteTime(data.whiteTime);
      setBlackTime(data.blackTime);
      setRejoinData(data.fen, data.moves);
      if (!gameMode) setGameMode("online");
      setStatus("in-progress");
      toast.success("Reconnected to your game!");
    };

    const handleRejoinError = () => {
      toast.error("No active game found. Redirecting...");
      router.push("/play");
    };

    socket.on("gameRejoined", handleGameRejoined);
    socket.on("rejoinError", handleRejoinError);

    // Request rejoin from server
    socket.emit("rejoinGame", { roomId: gameId });

    return () => {
      socket.off("gameRejoined", handleGameRejoined);
      socket.off("rejoinError", handleRejoinError);
    };
  }, [socket, isSocketConnected, gameId, roomId, status, address, gameMode, router, setRoomId, setPlayerColor, setOpponent, setPlayer, setWhiteTime, setBlackTime, setRejoinData, setGameMode, setStatus]);

  return (
    <main className="flex min-h-screen flex-col bg-black text-white selection:bg-white/20">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black pointer-events-none" />

      <div className="container relative mx-auto flex flex-1 flex-col items-center gap-6 px-3 pt-20 pb-6 sm:px-6 sm:pt-32 sm:gap-12 lg:flex-row lg:items-start lg:justify-center">
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
