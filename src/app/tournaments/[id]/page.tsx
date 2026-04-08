"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { useSocket } from "@/hooks/useSocket";
import { useAccount } from "wagmi";
import { ArenaHeader } from "@/components/tournament/arena-header";
import { ArenaLeaderboard } from "@/components/tournament/arena-leaderboard";
import { ArenaGamesGrid } from "@/components/tournament/arena-games-grid";
import { ArenaPlayerLobby } from "@/components/tournament/arena-player-lobby";
import {
  getTournamentById,
  getArenaStandings,
  getOngoingArenaGames,
  type TournamentDetail,
} from "@/app/tournament-actions";
import type { ArenaStanding, ArenaGame } from "@/types/arena";

export default function ActiveTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { address } = useAccount();
  const { socket } = useSocket(address ?? undefined);

  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [standings, setStandings] = useState<ArenaStanding[]>([]);
  const [ongoingGames, setOngoingGames] = useState<ArenaGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isParticipant, setIsParticipant] = useState(false);

  // Fetch tournament data
  useEffect(() => {
    async function fetchData() {
      try {
        const [tournamentResult, standingsResult, gamesResult] = await Promise.all([
          getTournamentById(resolvedParams.id),
          getArenaStandings(resolvedParams.id),
          getOngoingArenaGames(resolvedParams.id),
        ]);

        if (tournamentResult.success) {
          setTournament(tournamentResult.data);

          // Check if current user is a participant
          if (address && standingsResult.success) {
            const participant = standingsResult.data.find(
              s => s.walletAddress.toLowerCase() === address.toLowerCase()
            );
            setIsParticipant(!!participant);
          }
        } else {
          setError(tournamentResult.error);
        }

        if (standingsResult.success) {
          setStandings(standingsResult.data);
        }

        if (gamesResult.success) {
          setOngoingGames(gamesResult.data);
        }

        setLoading(false);
      } catch (err) {
        setError("Failed to load tournament");
        setLoading(false);
      }
    }

    fetchData();
  }, [resolvedParams.id, address]);

  // Subscribe to Socket.IO real-time updates
  useEffect(() => {
    if (!socket || !resolvedParams.id) return;

    const roomName = `tournament:${resolvedParams.id}`;
    socket.emit("arena:register", { tournamentId: resolvedParams.id });

    const handleArenaState = ({ standings: newStandings, ongoingGames: newGames }: { standings: ArenaStanding[]; ongoingGames: ArenaGame[] }) => {
      console.log("[ARENA PAGE] Received arena:state with", newStandings.length, "standings and", newGames.length, "ongoing games");
      setStandings(newStandings);
      setOngoingGames(newGames);
    };

    const handleStandingsUpdate = ({ standings: newStandings, ongoingGames: newGames }: { standings: ArenaStanding[]; ongoingGames?: ArenaGame[] }) => {
      console.log("[ARENA PAGE] Received standingsUpdate:", newStandings.map(s => ({ wallet: s.walletAddress, points: s.points, wins: s.wins })));
      setStandings(newStandings);

      // Update ongoing games if provided
      if (newGames) {
        console.log("[ARENA PAGE] Received ongoing games update:", newGames.length);
        setOngoingGames(newGames);
      }
    };

    const handleArenaEnded = () => {
      // Refresh data when arena ends
      getArenaStandings(resolvedParams.id).then((result) => {
        if (result.success) setStandings(result.data);
      });
    };

    socket.on("arena:state", handleArenaState);
    socket.on("arena:standingsUpdate", handleStandingsUpdate);
    socket.on("arena:ended", handleArenaEnded);

    // Fallback: Periodically refresh ongoing games from DB (less frequent since we get socket updates)
    // This helps catch any missed updates
    const gamesInterval = setInterval(async () => {
      const result = await getOngoingArenaGames(resolvedParams.id);
      if (result.success) {
        console.log("[ARENA PAGE] Fallback DB refresh - got", result.data.length, "games");
        setOngoingGames(result.data);
      }
    }, 30000); // Reduced from 5s to 30s

    return () => {
      socket.off("arena:state", handleArenaState);
      socket.off("arena:standingsUpdate", handleStandingsUpdate);
      socket.off("arena:ended", handleArenaEnded);
      clearInterval(gamesInterval);
    };
  }, [socket, resolvedParams.id]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="flex h-96 items-center justify-center">
          <div className="text-white/40">Loading tournament...</div>
        </div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <div className="text-red-400">{error || "Tournament not found"}</div>
        </div>
      </div>
    );
  }

  if (tournament.tournamentType !== "ARENA") {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-white/40">
          This is not an arena tournament
        </div>
      </div>
    );
  }

  const endTime = tournament.endTime ? new Date(tournament.endTime).getTime() : Date.now() + 3600000;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-6">
        {/* Header with countdown */}
        <ArenaHeader
          name={tournament.name}
          endTime={endTime}
          startsAt={tournament.startsAt}
          status={tournament.status}
          playerCount={tournament.playerCount}
          prizePool={tournament.prizePool}
          token={tournament.token}
        />

        {/* Player Lobby - only for participants */}
        {isParticipant && tournament.status === "IN_PROGRESS" && (
          <ArenaPlayerLobby tournamentId={resolvedParams.id} />
        )}

        {/* Main content: Games Grid + Leaderboard */}
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          {/* Left: Ongoing Games Grid */}
          <ArenaGamesGrid games={ongoingGames} />

          {/* Right: Leaderboard */}
          <ArenaLeaderboard standings={standings} currentUserAddress={address} />
        </div>

        {/* Status banner */}
        {tournament.status === "COMPLETED" && (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-center">
            <div className="font-semibold text-green-400">Tournament Completed</div>
            {standings.length > 0 && (
              <div className="mt-1 text-sm text-white/60">
                Winner: {standings[0].walletAddress.slice(0, 6)}...{standings[0].walletAddress.slice(-4)} with {standings[0].points} points
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
