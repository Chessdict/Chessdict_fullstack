import type { Chess } from "chess.js";

export type PromotionPiece = "q" | "r" | "b" | "n";

export type PromotionSelection = {
  from: string;
  to: string;
  color: "white" | "black";
};

export const PROMOTION_PIECES: PromotionPiece[] = ["q", "n", "r", "b"];

export function getPromotionSelection(
  game: Chess,
  from: string,
  to: string,
): PromotionSelection | null {
  const piece = game.get(from as never);
  if (!piece || piece.type !== "p") return null;

  const move = game
    .moves({ square: from as never, verbose: true })
    .find((candidate: any) => candidate.to === to && candidate.promotion);

  if (!move) return null;

  return {
    from,
    to,
    color: piece.color === "w" ? "white" : "black",
  };
}
