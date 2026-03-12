"use client";

import { useEffect, use } from "react";
import { useAccount } from "wagmi";
import { useSocket } from "@/hooks/useSocket";
import { useTournamentStore } from "@/stores/tournament-store";
import { TournamentLobby } from "@/components/tournament/tournament-lobby";
import { TournamentGameBoard } from "@/components/tournament/tournament-game-board";
import { loginWithWallet } from "@/app/actions";

export default function TournamentPlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const { address, isConnected } = useAccount();
  const { socket, isConnected: isSocketConnected } = useSocket(
    address ?? undefined,
  );

  const {
    phase,
    setTournamentId,
    setPhase,
    setRoundInfo,
    setTimeControl,
    setCurrentGame,
    setStandings,
    setParticipants,
    setRoundEndTime,
    setBreakEndTime,
    setStartingEndTime,
    setIsFinalBreak,
    setRoundProgress,
    setGameResult,
    setDisconnectedPlayer,
    removeDisconnectedPlayer,
    clearDisconnectedPlayers,
    reset,
  } = useTournamentStore();

  // Login with wallet on mount
  useEffect(() => {
    if (isConnected && address) {
      loginWithWallet(address).catch(console.error);
    }
  }, [isConnected, address]);

  // Set tournament ID
  useEffect(() => {
    setTournamentId(tournamentId);
    return () => {
      reset();
    };
  }, [tournamentId, setTournamentId, reset]);

  // Register for tournament via socket
  useEffect(() => {
    if (!socket || !isSocketConnected || !tournamentId) return;

    socket.emit("tournament:register", { tournamentId });

    // ── Socket event handlers ──

    const handleState = (data: any) => {
      setPhase(data.phase);
      setRoundInfo(data.currentRound, data.totalRounds);
      setTimeControl(data.timeControl);
      if (data.standings?.length) setStandings(data.standings);
      if (data.participants?.length) setParticipants(data.participants);
      if (data.roundEndTime) setRoundEndTime(data.roundEndTime);
    };

    const handlePlayerConnected = (data: any) => {
      // Update participant connected status
      const store = useTournamentStore.getState();
      const updated = store.participants.map((p) =>
        p.walletAddress === data.walletAddress
          ? { ...p, connected: true }
          : p,
      );
      setParticipants(updated);
    };

    const handlePlayerDisconnected = (data: any) => {
      const store = useTournamentStore.getState();
      const updated = store.participants.map((p) =>
        p.walletAddress === data.walletAddress
          ? { ...p, connected: false }
          : p,
      );
      setParticipants(updated);
    };

    const handleForfeitCountdown = (data: any) => {
      // A player disconnected and has 30 seconds to reconnect
      setDisconnectedPlayer(data.walletAddress, data.forfeitDeadline);
    };

    const handleForfeitCancelled = (data: any) => {
      // Player reconnected in time — remove the countdown
      removeDisconnectedPlayer(data.walletAddress);
    };

    const handleStarting = (data: any) => {
      setPhase("starting");
      setIsFinalBreak(false);
      setRoundInfo(0, data.totalRounds);
      setTimeControl(data.timeControl);
      setStartingEndTime(Date.now() + data.startsIn * 1000);
      if (data.standings) setStandings(data.standings);
    };

    const handleRoundStart = (data: any) => {
      setIsFinalBreak(false);
      setRoundInfo(data.round, data.totalRounds);
      setRoundEndTime(data.roundEndTime);
      if (data.standings) setStandings(data.standings);
      // Phase is set by gameStart or bye event
    };

    const handleGameStart = (data: any) => {
      setPhase("playing");
      setRoundInfo(data.round, data.totalRounds);
      setTimeControl(data.timeControl);
      setCurrentGame(data.gameId, data.color, data.opponentAddress);
      // Server already joins sockets to game rooms — no need to emit joinRoom
    };

    const handleBye = (data: any) => {
      setPhase("bye");
      setRoundInfo(data.round, data.totalRounds);
    };

    const handleGameOver = (data: any) => {
      setGameResult(
        data.isDraw ? "draw" : data.winner,
        data.reason || (data.isDraw ? "draw" : "game over"),
      );
      setPhase("round-waiting");
      if (data.gamesCompleted !== undefined) {
        setRoundProgress(data.gamesCompleted, data.totalGames);
      }
      if (data.roundEndTime) setRoundEndTime(data.roundEndTime);
    };

    const handleStandings = (data: any) => {
      setStandings(data.standings);
      if (data.gamesCompleted !== undefined) {
        setRoundProgress(data.gamesCompleted, data.totalGames);
      }
    };

    const handleRoundComplete = (data: any) => {
      setPhase("break");
      setBreakEndTime(data.breakEndTime);
      setIsFinalBreak(Boolean(data.isLastRound));
      clearDisconnectedPlayers();
      setRoundInfo(data.round, data.isLastRound ? data.round : data.round + 0); // keep current round info
      if (data.standings) setStandings(data.standings);
    };

    const handleComplete = (data: any) => {
      setPhase("complete");
      setIsFinalBreak(false);
      if (data.standings) setStandings(data.standings);
    };

    const handleForceEnd = () => {
      setGameResult("draw", "round_timeout");
      setPhase("round-waiting");
    };

    socket.on("tournament:state", handleState);
    socket.on("tournament:playerConnected", handlePlayerConnected);
    socket.on("tournament:playerDisconnected", handlePlayerDisconnected);
    socket.on("tournament:forfeitCountdown", handleForfeitCountdown);
    socket.on("tournament:forfeitCancelled", handleForfeitCancelled);
    socket.on("tournament:starting", handleStarting);
    socket.on("tournament:roundStart", handleRoundStart);
    socket.on("tournament:gameStart", handleGameStart);
    socket.on("tournament:bye", handleBye);
    socket.on("tournament:gameOver", handleGameOver);
    socket.on("tournament:standings", handleStandings);
    socket.on("tournament:roundComplete", handleRoundComplete);
    socket.on("tournament:complete", handleComplete);
    socket.on("tournament:forceEnd", handleForceEnd);

    return () => {
      socket.off("tournament:state", handleState);
      socket.off("tournament:playerConnected", handlePlayerConnected);
      socket.off("tournament:playerDisconnected", handlePlayerDisconnected);
      socket.off("tournament:forfeitCountdown", handleForfeitCountdown);
      socket.off("tournament:forfeitCancelled", handleForfeitCancelled);
      socket.off("tournament:starting", handleStarting);
      socket.off("tournament:roundStart", handleRoundStart);
      socket.off("tournament:gameStart", handleGameStart);
      socket.off("tournament:bye", handleBye);
      socket.off("tournament:gameOver", handleGameOver);
      socket.off("tournament:standings", handleStandings);
      socket.off("tournament:roundComplete", handleRoundComplete);
      socket.off("tournament:complete", handleComplete);
      socket.off("tournament:forceEnd", handleForceEnd);
    };
  }, [
    socket,
    isSocketConnected,
    tournamentId,
    setPhase,
    setRoundInfo,
    setTimeControl,
    setCurrentGame,
    setStandings,
    setParticipants,
    setRoundEndTime,
    setBreakEndTime,
    setStartingEndTime,
    setIsFinalBreak,
    setRoundProgress,
    setGameResult,
    setDisconnectedPlayer,
    removeDisconnectedPlayer,
    clearDisconnectedPlayers,
  ]);

  const showBoard = phase === "playing";

  return (
    <main className="flex min-h-screen flex-col bg-black text-white selection:bg-white/20">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black pointer-events-none" />

      {/* Connection indicator */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur-xl">
        <div
          className={`h-2 w-2 rounded-full ${isSocketConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
        />
        <span className="text-[10px] font-medium text-white/40">
          {isSocketConnected ? "Connected" : "Reconnecting..."}
        </span>
      </div>

      <div className="container relative mx-auto flex flex-1 flex-col items-start gap-8 px-6 pt-24 pb-6 lg:flex-row lg:justify-center">
        {/* Left: Board (only when playing) */}
        {showBoard && (
          <div className="w-full max-w-[720px] flex-none">
            <TournamentGameBoard
              socket={socket}
              myAddress={address ?? ""}
            />
          </div>
        )}

        {/* Right: Tournament status panel (always visible) */}
        <div
          className={`w-full ${showBoard ? "max-w-sm" : "max-w-lg mx-auto"} flex-none`}
        >
          <TournamentLobby myAddress={address} />
        </div>
      </div>
    </main>
  );
}
