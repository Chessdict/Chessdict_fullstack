import { create } from "zustand";

export type Player = {
  address: string;
  rating: number;
};

export type GameStatus = "waiting" | "matched" | "in-progress" | "finished";

export type MoveRecord = {
  san: string; // Standard algebraic notation (e.g., "e4", "Nf3")
  from: string; // Source square
  to: string; // Target square
  color: "w" | "b"; // Which player made the move
  piece: string; // Piece type
  timestamp: number; // When the move was made
};

type GameState = {
  status: GameStatus;
  gameMode: "online" | "computer" | "friend" | "tournament" | null;
  difficulty: "easy" | "medium" | "hard";
  stakeAmount: number;
  // On-chain state
  onChainGameId: bigint | null;
  stakeToken: string | null;
  stakeAmountRaw: string | null;
  player?: Player;
  opponent?: Player;
  setGameMode: (
    mode: "online" | "computer" | "friend" | "tournament" | null,
  ) => void;
  setDifficulty: (difficulty: "easy" | "medium" | "hard") => void;
  setStatus: (status: GameStatus) => void;
  setStakeAmount: (amount: number) => void;
  setOnChainGameId: (id: bigint | null) => void;
  setStakeToken: (token: string | null) => void;
  setStakeAmountRaw: (amount: string | null) => void;
  setPlayer: (player: Player) => void;
  setOpponent: (opponent: Player) => void;
  roomId?: string;
  playerColor?: "white" | "black";
  setRoomId: (id: string) => void;
  setPlayerColor: (color: "white" | "black") => void;
  // Move history
  moves: MoveRecord[];
  addMove: (move: MoveRecord) => void;
  clearMoves: () => void;
  // Move navigation (null = viewing latest/live position)
  viewMoveIndex: number | null;
  setViewMoveIndex: (index: number | null) => void;
  // Connection status
  isOpponentConnected: boolean;
  setOpponentConnected: (connected: boolean) => void;
  // Draw offer state
  drawOfferReceived: boolean;
  drawOfferSent: boolean;
  setDrawOfferReceived: (received: boolean) => void;
  setDrawOfferSent: (sent: boolean) => void;
  // Timer state
  initialTime: number; // in seconds (default 600 = 10 minutes)
  whiteTime: number; // remaining time for white in seconds
  blackTime: number; // remaining time for black in seconds
  setInitialTime: (time: number) => void;
  setWhiteTime: (time: number) => void;
  setBlackTime: (time: number) => void;
  decrementWhiteTime: () => void;
  decrementBlackTime: () => void;
  resetTimers: () => void;
  gameOver: {
    winner: "white" | "black" | "draw" | "opponent" | null;
    reason:
      | "checkmate"
      | "stalemate"
      | "resignation"
      | "disconnection"
      | "timeout"
      | "draw"
      | null;
  } | null;
  setGameOver: (
    winner: "white" | "black" | "draw" | "opponent" | null,
    reason:
      | "checkmate"
      | "stalemate"
      | "resignation"
      | "disconnection"
      | "timeout"
      | "draw"
      | null,
  ) => void;
  // Rejoin state (for reconnecting after refresh)
  rejoinFen: string | null;
  rejoinMoves: MoveRecord[];
  setRejoinData: (fen: string, moves: MoveRecord[]) => void;
  clearRejoinData: () => void;
  // Rejoin chat messages
  rejoinChatMessages: { sender: string; text: string; timestamp: number }[];
  setRejoinChatMessages: (messages: { sender: string; text: string; timestamp: number }[]) => void;
  clearRejoinChatMessages: () => void;
  // Opponent disconnect countdown
  opponentDisconnectDeadline: number | null;
  setOpponentDisconnectDeadline: (deadline: number | null) => void;
  reset: () => void;
};

const DEFAULT_TIME = 600; // 10 minutes in seconds

const initialState = {
  status: "waiting" as GameStatus,
  gameMode: null as "online" | "computer" | "friend" | "tournament" | null,
  difficulty: "medium" as "easy" | "medium" | "hard",
  stakeAmount: 0,
  onChainGameId: null as bigint | null,
  stakeToken: null as string | null,
  stakeAmountRaw: null as string | null,
  player: undefined,
  opponent: undefined,
  moves: [] as MoveRecord[],
  viewMoveIndex: null as number | null,
  isOpponentConnected: false,
  drawOfferReceived: false,
  drawOfferSent: false,
  // Timer
  initialTime: DEFAULT_TIME,
  whiteTime: DEFAULT_TIME,
  blackTime: DEFAULT_TIME,
  gameOver: null,
  rejoinFen: null,
  rejoinMoves: [] as MoveRecord[],
  rejoinChatMessages: [] as { sender: string; text: string; timestamp: number }[],
  opponentDisconnectDeadline: null,
};

export const useGameStore = create<GameState>((set) => ({
  ...initialState,
  setGameMode: (mode) => set({ gameMode: mode }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setStatus: (status) => set({ status }),
  setStakeAmount: (amount) => set({ stakeAmount: amount }),
  setOnChainGameId: (id) => set({ onChainGameId: id }),
  setStakeToken: (token) => set({ stakeToken: token }),
  setStakeAmountRaw: (amount) => set({ stakeAmountRaw: amount }),
  setPlayer: (player) => set({ player }),
  setOpponent: (opponent) => set({ opponent }),
  setRoomId: (roomId) => set({ roomId }),
  setPlayerColor: (playerColor) => set({ playerColor }),
  addMove: (move) => set((state) => ({ moves: [...state.moves, move], viewMoveIndex: null })),
  clearMoves: () => set({ moves: [], viewMoveIndex: null }),
  setViewMoveIndex: (index) => set({ viewMoveIndex: index }),
  setOpponentConnected: (connected) => set({ isOpponentConnected: connected }),
  setDrawOfferReceived: (received) => set({ drawOfferReceived: received }),
  setDrawOfferSent: (sent) => set({ drawOfferSent: sent }),
  // Timer functions
  setInitialTime: (time) =>
    set({ initialTime: time, whiteTime: time, blackTime: time }),
  setWhiteTime: (time) => set({ whiteTime: time }),
  setBlackTime: (time) => set({ blackTime: time }),
  decrementWhiteTime: () =>
    set((state) => ({ whiteTime: Math.max(0, state.whiteTime - 1) })),
  decrementBlackTime: () =>
    set((state) => ({ blackTime: Math.max(0, state.blackTime - 1) })),
  resetTimers: () =>
    set((state) => ({
      whiteTime: state.initialTime,
      blackTime: state.initialTime,
    })),
  setGameOver: (winner, reason) => set({ gameOver: { winner, reason } }),
  setRejoinData: (fen, moves) => set({ rejoinFen: fen, rejoinMoves: moves }),
  clearRejoinData: () => set({ rejoinFen: null, rejoinMoves: [] }),
  setRejoinChatMessages: (messages) => set({ rejoinChatMessages: messages }),
  clearRejoinChatMessages: () => set({ rejoinChatMessages: [] }),
  setOpponentDisconnectDeadline: (deadline) => set({ opponentDisconnectDeadline: deadline }),
  reset: () =>
    set({
      ...initialState,
      roomId: undefined,
      playerColor: undefined,
      moves: [],
      viewMoveIndex: null,
      isOpponentConnected: false,
      drawOfferReceived: false,
      drawOfferSent: false,
      whiteTime: DEFAULT_TIME,
      blackTime: DEFAULT_TIME,
      gameOver: null,
      onChainGameId: null,
      stakeToken: null,
      stakeAmountRaw: null,
      rejoinFen: null,
      rejoinMoves: [],
      rejoinChatMessages: [],
      opponentDisconnectDeadline: null,
    }),
}));
