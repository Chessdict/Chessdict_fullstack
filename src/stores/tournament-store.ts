import { create } from "zustand";

export type TournamentPhase =
  | "lobby" // Waiting for players / tournament to start
  | "starting" // Countdown before round 1
  | "playing" // Active chess game
  | "bye" // Player has a bye this round
  | "round-waiting" // Game done, waiting for round timer
  | "break" // 10-second break between rounds
  | "complete"; // Tournament finished

export type Standing = {
  rank: number;
  walletAddress: string;
  userId: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
};

export type TournamentParticipantInfo = {
  walletAddress: string;
  connected: boolean;
};

type TournamentState = {
  // Tournament info
  tournamentId: string | null;
  phase: TournamentPhase;
  currentRound: number;
  totalRounds: number;
  timeControl: number; // minutes

  // Current game
  gameId: string | null;
  playerColor: "white" | "black" | null;
  opponentAddress: string | null;
  playerRating: number | null;
  opponentRating: number | null;

  // Standings
  standings: Standing[];
  participants: TournamentParticipantInfo[];

  // Countdowns (absolute timestamps in ms)
  roundEndTime: number | null;
  breakEndTime: number | null;
  startingEndTime: number | null;
  isFinalBreak: boolean;

  // Round progress
  gamesCompleted: number;
  totalGames: number;

  // Game Over state for current game
  gameResult: {
    winner: "white" | "black" | "draw" | null;
    reason: string | null;
  } | null;

  // Timer (per-player clock in seconds)
  whiteTime: number;
  blackTime: number;

  // Actions
  setTournamentId: (id: string) => void;
  setPhase: (phase: TournamentPhase) => void;
  setRoundInfo: (round: number, totalRounds: number) => void;
  setTimeControl: (tc: number) => void;
  setCurrentGame: (
    gameId: string,
    color: "white" | "black",
    opponentAddress: string,
    playerRating?: number | null,
    opponentRating?: number | null,
  ) => void;
  clearCurrentGame: () => void;
  setStandings: (standings: Standing[]) => void;
  setParticipants: (participants: TournamentParticipantInfo[]) => void;
  setRoundEndTime: (time: number | null) => void;
  setBreakEndTime: (time: number | null) => void;
  setStartingEndTime: (time: number | null) => void;
  setIsFinalBreak: (isFinalBreak: boolean) => void;
  setRoundProgress: (completed: number, total: number) => void;
  setGameResult: (
    winner: "white" | "black" | "draw" | null,
    reason: string | null,
  ) => void;
  setWhiteTime: (t: number) => void;
  setBlackTime: (t: number) => void;
  decrementWhiteTime: () => void;
  decrementBlackTime: () => void;

  // Disconnect tracking
  disconnectedPlayers: Record<string, number>; // walletAddress -> forfeitDeadline timestamp
  setDisconnectedPlayer: (walletAddress: string, deadline: number) => void;
  removeDisconnectedPlayer: (walletAddress: string) => void;
  clearDisconnectedPlayers: () => void;

  reset: () => void;
};

const initialState = {
  tournamentId: null as string | null,
  phase: "lobby" as TournamentPhase,
  currentRound: 0,
  totalRounds: 0,
  timeControl: 10,
  gameId: null as string | null,
  playerColor: null as "white" | "black" | null,
  opponentAddress: null as string | null,
  playerRating: null as number | null,
  opponentRating: null as number | null,
  standings: [] as Standing[],
  participants: [] as TournamentParticipantInfo[],
  roundEndTime: null as number | null,
  breakEndTime: null as number | null,
  startingEndTime: null as number | null,
  isFinalBreak: false,
  gamesCompleted: 0,
  totalGames: 0,
  gameResult: null as TournamentState["gameResult"],
  whiteTime: 600,
  blackTime: 600,
  disconnectedPlayers: {} as Record<string, number>,
};

export const useTournamentStore = create<TournamentState>((set) => ({
  ...initialState,

  setTournamentId: (id) => set({ tournamentId: id }),
  setPhase: (phase) => set({ phase }),
  setRoundInfo: (currentRound, totalRounds) =>
    set({ currentRound, totalRounds }),
  setTimeControl: (tc) =>
    set({
      timeControl: tc,
      whiteTime: tc * 60,
      blackTime: tc * 60,
    }),
  setCurrentGame: (gameId, color, opponentAddress, playerRating = null, opponentRating = null) =>
    set((state) => ({
      gameId,
      playerColor: color,
      opponentAddress,
      playerRating,
      opponentRating,
      gameResult: null,
      whiteTime: state.timeControl * 60,
      blackTime: state.timeControl * 60,
    })),
  clearCurrentGame: () =>
    set({
      gameId: null,
      playerColor: null,
      opponentAddress: null,
      playerRating: null,
      opponentRating: null,
    }),
  setStandings: (standings) => set({ standings }),
  setParticipants: (participants) => set({ participants }),
  setRoundEndTime: (time) => set({ roundEndTime: time }),
  setBreakEndTime: (time) => set({ breakEndTime: time }),
  setStartingEndTime: (time) => set({ startingEndTime: time }),
  setIsFinalBreak: (isFinalBreak) => set({ isFinalBreak }),
  setRoundProgress: (completed, total) =>
    set({ gamesCompleted: completed, totalGames: total }),
  setGameResult: (winner, reason) => set({ gameResult: { winner, reason } }),
  setWhiteTime: (t) => set({ whiteTime: t }),
  setBlackTime: (t) => set({ blackTime: t }),
  decrementWhiteTime: () =>
    set((state) => ({ whiteTime: Math.max(0, state.whiteTime - 1) })),
  decrementBlackTime: () =>
    set((state) => ({ blackTime: Math.max(0, state.blackTime - 1) })),
  setDisconnectedPlayer: (walletAddress, deadline) =>
    set((state) => ({
      disconnectedPlayers: { ...state.disconnectedPlayers, [walletAddress.toLowerCase()]: deadline },
    })),
  removeDisconnectedPlayer: (walletAddress) =>
    set((state) => {
      const { [walletAddress.toLowerCase()]: _, ...rest } = state.disconnectedPlayers;
      return { disconnectedPlayers: rest };
    }),
  clearDisconnectedPlayers: () => set({ disconnectedPlayers: {} }),
  reset: () => set({ ...initialState }),
}));
