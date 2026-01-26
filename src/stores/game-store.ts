import { create } from "zustand";

export type Player = {
  address: string;
  rating: number;
};

export type GameStatus = "waiting" | "matched" | "in-progress" | "finished";

type GameState = {
  status: GameStatus;
  stakeAmount: number;
  player?: Player;
  opponent?: Player;
  setStatus: (status: GameStatus) => void;
  setStakeAmount: (amount: number) => void;
  setPlayer: (player: Player) => void;
  setOpponent: (opponent: Player) => void;
  reset: () => void;
};

const initialState = {
  status: "waiting" as GameStatus,
  stakeAmount: 0,
  player: undefined,
  opponent: undefined,
};

export const useGameStore = create<GameState>((set) => ({
  ...initialState,
  setStatus: (status) => set({ status }),
  setStakeAmount: (amount) => set({ stakeAmount: amount }),
  setPlayer: (player) => set({ player }),
  setOpponent: (opponent) => set({ opponent }),
  reset: () => set(initialState),
}));

