import { create } from "zustand";

export type Player = {
  address: string;
  rating: number;
};

export type GameStatus = "waiting" | "matched" | "in-progress" | "finished";

type GameState = {
  status: GameStatus;
  gameMode: "online" | "computer" | "friend" | null;
  difficulty: "easy" | "medium" | "hard";
  stakeAmount: number;
  player?: Player;
  opponent?: Player;
  setGameMode: (mode: "online" | "computer" | "friend" | null) => void;
  setDifficulty: (difficulty: "easy" | "medium" | "hard") => void;
  setStatus: (status: GameStatus) => void;
  setStakeAmount: (amount: number) => void;
  setPlayer: (player: Player) => void;
  setOpponent: (opponent: Player) => void;
  roomId?: string;
  playerColor?: "white" | "black";
  setRoomId: (id: string) => void;
  setPlayerColor: (color: "white" | "black") => void;
  reset: () => void;
};

const initialState = {
  status: "waiting" as GameStatus,
  gameMode: null as "online" | "computer" | "friend" | null,
  difficulty: "medium" as "easy" | "medium" | "hard",
  stakeAmount: 0,
  player: undefined,
  opponent: undefined,
};

export const useGameStore = create<GameState>((set) => ({
  ...initialState,
  setGameMode: (mode) => set({ gameMode: mode }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setStatus: (status) => set({ status }),
  setStakeAmount: (amount) => set({ stakeAmount: amount }),
  setPlayer: (player) => set({ player }),
  setOpponent: (opponent) => set({ opponent }),
  setRoomId: (roomId) => set({ roomId }),
  setPlayerColor: (playerColor) => set({ playerColor }),
  reset: () =>
    set({ ...initialState, roomId: undefined, playerColor: undefined }),
}));
