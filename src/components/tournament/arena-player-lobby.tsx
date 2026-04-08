"use client";

import { useEffect } from "react";
import { useArenaStore } from "@/stores/arena-store";
import { useSocket } from "@/hooks/useSocket";
import { useAccount } from "wagmi";
import { ArenaQueueWaiting } from "./arena-queue-waiting";
import { TournamentGameBoard } from "./tournament-game-board";

interface ArenaPlayerLobbyProps {
  tournamentId: string;
}

export function ArenaPlayerLobby({ tournamentId }: ArenaPlayerLobbyProps) {
  const { address } = useAccount();
  const { socket } = useSocket(address ?? undefined);

  const {
    phase,
    gameId,
    playerColor,
    opponentAddress,
    opponentRating,
    queuePosition,
    queueSize,
    gameResult,
    setPhase,
    setCurrentGame,
    setQueueStatus,
    setGameResult,
    clearCurrentGame,
  } = useArenaStore();

  console.log("[ARENA LOBBY] Current phase:", phase, "gameResult:", gameResult, "gameId:", gameId);

  // Request pairing
  const handleRequestPairing = () => {
    if (!socket || !address) return;
    socket.emit("arena:requestPairing", { tournamentId });
    setPhase("queue");
  };

  const handleCancelQueue = () => {
    setPhase("lobby");
  };

  // Listen for pairing found
  useEffect(() => {
    if (!socket) return;

    const handlePairingFound = (data: {
      gameId: string;
      opponentAddress: string;
      opponentRating: number;
      color: "white" | "black";
    }) => {
      setCurrentGame(data.gameId, data.color, data.opponentAddress, data.opponentRating);
    };

    const handleQueuePosition = (data: { position: number; queueSize: number }) => {
      setQueueStatus(data.position, data.queueSize);
    };

    socket.on("arena:pairingFound", handlePairingFound);
    socket.on("arena:queuePosition", handleQueuePosition);

    return () => {
      socket.off("arena:pairingFound", handlePairingFound);
      socket.off("arena:queuePosition", handleQueuePosition);
    };
  }, [socket, setCurrentGame, setQueueStatus]);

  // Phase: Lobby (not in queue)
  if (phase === "lobby") {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-6 rounded-xl border border-white/10 bg-white/5 p-8">
        <div className="text-center">
          <div className="text-2xl font-bold text-white">Ready to play?</div>
          <div className="mt-2 text-sm text-white/60">
            Click below to enter the matchmaking queue
          </div>
        </div>

        <button
          onClick={handleRequestPairing}
          className="group relative overflow-hidden rounded-full px-8 py-4"
        >
          <div className="absolute inset-0 border border-white/20 rounded-full" />
          <div className="absolute inset-px rounded-full bg-gradient-to-b from-green-500/20 to-transparent" />
          <span className="relative text-lg font-semibold text-white">
            Find Game
          </span>
        </button>
      </div>
    );
  }

  // Phase: Queue (waiting for opponent)
  if (phase === "queue") {
    return (
      <ArenaQueueWaiting
        queuePosition={queuePosition}
        queueSize={queueSize}
        onCancelQueue={handleCancelQueue}
      />
    );
  }

  // Phase: Playing (active game)
  if (phase === "playing" && gameId && playerColor && socket) {
    return (
      <TournamentGameBoard
        socket={socket}
        myAddress={address ?? ""}
        gameId={gameId}
        myColor={playerColor}
        opponentAddress={opponentAddress ?? ""}
      />
    );
  }

  // Phase: Game ended
  if (phase === "game-ended" && gameResult) {
    const isWin =
      gameResult.winner === "white" && playerColor === "white" ||
      gameResult.winner === "black" && playerColor === "black";
    const isDraw = gameResult.winner === "draw";

    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-6 rounded-xl border border-white/10 bg-white/5 p-8">
        <div className="text-center">
          <div
            className={`text-3xl font-bold ${
              isWin ? "text-green-400" : isDraw ? "text-white/60" : "text-red-400"
            }`}
          >
            {isWin ? "You Won!" : isDraw ? "Draw" : "You Lost"}
          </div>
          {gameResult.reason && (
            <div className="mt-2 text-sm text-white/40">
              {gameResult.reason}
            </div>
          )}
        </div>

        <button
          onClick={() => {
            clearCurrentGame();
            handleRequestPairing();
          }}
          className="group relative overflow-hidden rounded-full px-8 py-4"
        >
          <div className="absolute inset-0 border border-white/20 rounded-full" />
          <div className="absolute inset-px rounded-full bg-gradient-to-b from-green-500/20 to-transparent" />
          <span className="relative text-lg font-semibold text-white">
            Play Next Game
          </span>
        </button>

        <button
          onClick={() => setPhase("lobby")}
          className="text-sm text-white/40 hover:text-white"
        >
          Return to Lobby
        </button>
      </div>
    );
  }

  // Default/Complete phase
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-6 rounded-xl border border-white/10 bg-white/5 p-8">
      <div className="text-center text-white/40">
        Tournament complete or waiting...
      </div>
    </div>
  );
}
