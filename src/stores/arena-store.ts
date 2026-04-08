import { create } from "zustand";
import type { ArenaStanding, ArenaGame } from "@/types/arena";

export type ArenaPhase = "lobby" | "queue" | "playing" | "game-ended" | "complete";

type ArenaState = {
  // Tournament info
  tournamentId: string | null;
  phase: ArenaPhase;
  durationMinutes: number;
  timeControl: number;
  endTime: number | null; // timestamp in ms
  minRating: number | null;
  maxRating: number | null;

  // Current game
  gameId: string | null;
  playerColor: "white" | "black" | null;
  opponentAddress: string | null;
  opponentRating: number | null;

  // Leaderboard
  standings: ArenaStanding[];

  // Ongoing games (for view page)
  ongoingGames: ArenaGame[];

  // Queue status
  queuePosition: number | null;
  queueSize: number;

  // Game result (shown after game ends)
  gameResult: {
    winner: "white" | "black" | "draw" | null;
    reason: string | null;
  } | null;

  // Actions
  setTournamentId: (id: string) => void;
  setPhase: (phase: ArenaPhase) => void;
  setTournamentInfo: (info: {
    durationMinutes: number;
    timeControl: number;
    endTime: number;
    minRating?: number | null;
    maxRating?: number | null;
  }) => void;
  setCurrentGame: (
    gameId: string,
    color: "white" | "black",
    opponentAddress: string,
    opponentRating: number
  ) => void;
  clearCurrentGame: () => void;
  setStandings: (standings: ArenaStanding[]) => void;
  setOngoingGames: (games: ArenaGame[]) => void;
  setQueueStatus: (position: number | null, size: number) => void;
  setGameResult: (winner: "white" | "black" | "draw" | null, reason: string | null) => void;
  reset: () => void;
};

const initialState = {
  tournamentId: null,
  phase: "lobby" as ArenaPhase,
  durationMinutes: 60,
  timeControl: 3,
  endTime: null,
  minRating: null,
  maxRating: null,
  gameId: null,
  playerColor: null,
  opponentAddress: null,
  opponentRating: null,
  standings: [],
  ongoingGames: [],
  queuePosition: null,
  queueSize: 0,
  gameResult: null,
};

export const useArenaStore = create<ArenaState>((set) => ({
  ...initialState,

  setTournamentId: (id) => set({ tournamentId: id }),

  setPhase: (phase) => set({ phase }),

  setTournamentInfo: (info) =>
    set({
      durationMinutes: info.durationMinutes,
      timeControl: info.timeControl,
      endTime: info.endTime,
      minRating: info.minRating ?? null,
      maxRating: info.maxRating ?? null,
    }),

  setCurrentGame: (gameId, color, opponentAddress, opponentRating) => {
    console.log(`[ARENA STORE] setCurrentGame called - gameId: ${gameId}, color: ${color}, clearing previous game result`);
    set({
      gameId,
      playerColor: color,
      opponentAddress,
      opponentRating,
      phase: "playing",
      gameResult: null, // Clear previous game result
    });
  },

  clearCurrentGame: () => {
    console.log(`[ARENA STORE] clearCurrentGame called`);
    set({
      gameId: null,
      playerColor: null,
      opponentAddress: null,
      opponentRating: null,
      gameResult: null, // Also clear game result
    });
  },

  setStandings: (standings) => set({ standings }),

  setOngoingGames: (games) => set({ ongoingGames: games }),

  setQueueStatus: (position, size) =>
    set({ queuePosition: position, queueSize: size }),

  setGameResult: (winner, reason) => {
    console.log(`[ARENA STORE] setGameResult called - winner: ${winner}, reason: ${reason}, setting phase to game-ended`);
    set({
      gameResult: { winner, reason },
      phase: "game-ended",
    });
  },

  reset: () => set(initialState),
}));
