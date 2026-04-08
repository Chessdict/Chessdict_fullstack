// Arena Tournament Types

export type ArenaPhase =
  | "lobby" // Waiting for tournament to start
  | "queue" // In matchmaking queue
  | "playing" // Currently in a game
  | "game-ended" // Game just finished
  | "complete"; // Tournament ended

export type ArenaStanding = {
  rank: number;
  userId: number;
  walletAddress: string;
  points: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  buchholzScore: number;
  rating: number;
};

export type ArenaGame = {
  id: string;
  tournamentId: string;
  whitePlayerId: number;
  blackPlayerId: number;
  whitePlayerAddress: string;
  blackPlayerAddress: string;
  whiteRating: number;
  blackRating: number;
  status: "IN_PROGRESS" | "COMPLETED";
  whiteTime?: number; // Seconds remaining
  blackTime?: number;
  createdAt: string;
};

export type ArenaParticipantInfo = {
  userId: number;
  walletAddress: string;
  rating: number;
  connected: boolean;
};

export type ArenaConfig = {
  tournamentId: string;
  name: string;
  durationMinutes: number;
  timeControl: number;
  minRating: number | null;
  maxRating: number | null;
  entryFee: number;
  prizePool: number;
  token: string | null;
  startsAt: string; // ISO datetime
  endTime: string | null; // ISO datetime
};

export type ArenaMatchmakingStatus = {
  inQueue: boolean;
  queuePosition: number | null;
  queueSize: number;
  estimatedWaitSeconds: number | null;
};

// Socket.IO event payloads

export type ArenaPairingFoundPayload = {
  gameId: string;
  opponentAddress: string;
  opponentRating: number;
  color: "white" | "black";
  timeControl: number;
};

export type ArenaStandingsUpdatePayload = {
  standings: ArenaStanding[];
};

export type ArenaTimeRemainingPayload = {
  remainingMs: number; // Milliseconds until tournament ends
};

export type ArenaEndedPayload = {
  finalStandings: ArenaStanding[];
  winner: {
    userId: number;
    walletAddress: string;
    points: number;
  } | null;
};

export type ArenaQueuePositionPayload = {
  position: number;
  queueSize: number;
};

export type ArenaGameCompletePayload = {
  gameId: string;
  winner: "white" | "black" | "draw";
  reason: string;
};
