import type { Chess } from "chess.js";

export type DisplayDrawReason =
  | "draw"
  | "stalemate"
  | "threefold_repetition"
  | "fifty_move_rule"
  | "insufficient_material";

export function getAutomaticDrawReason(game: Chess): DisplayDrawReason | null {
  if (game.isStalemate()) return "stalemate";
  if (game.isThreefoldRepetition()) return "threefold_repetition";
  if (game.isDrawByFiftyMoves()) return "fifty_move_rule";
  if (game.isInsufficientMaterial()) return "insufficient_material";
  if (game.isDraw()) return "draw";
  return null;
}

function humanizeReason(reason: string) {
  return reason
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatGameReason(
  reason: string | null | undefined,
  didPlayerWin = false,
) {
  if (!reason) return "";

  switch (reason) {
    case "disconnection":
      return "Opponent Disconnected";
    case "resignation":
      return didPlayerWin ? "Opponent Resigned" : "You Resigned";
    case "timeout":
      return didPlayerWin ? "Opponent Ran Out of Time" : "You Ran Out of Time";
    case "draw":
      return "Draw by Agreement";
    case "stalemate":
      return "Draw by Stalemate";
    case "threefold_repetition":
      return "Draw by Threefold Repetition";
    case "fifty_move_rule":
      return "Draw by Fifty-Move Rule";
    case "insufficient_material":
      return "Draw by Insufficient Material";
    default:
      return humanizeReason(reason);
  }
}
