import { Chess } from "chess.js";

function normalizeColor(color) {
  if (color === "white" || color === "w") return "w";
  if (color === "black" || color === "b") return "b";
  return null;
}

function getSideMaterialProfile(game, color) {
  const counts = { p: 0, n: 0, b: 0, r: 0, q: 0 };

  for (const row of game.board()) {
    for (const piece of row) {
      if (!piece || piece.color !== color || piece.type === "k") continue;
      counts[piece.type] += 1;
    }
  }

  const nonKing =
    counts.p +
    counts.n +
    counts.b +
    counts.r +
    counts.q;

  return {
    counts,
    nonKing,
    bareKing: nonKing === 0,
  };
}

/**
 * Practical timeout-vs-insufficient-material adjudication for common live cases.
 *
 * FIDE 6.9 is about whether the player with time left can ever checkmate by any
 * legal series of moves. Exact detection is deeper than normal insufficient
 * material, so this helper handles the clear low-material cases we can decide
 * safely and deterministically on the server.
 */
export function isTimeoutDrawByInsufficientWinningMaterial(fen, winnerColor) {
  const normalizedWinnerColor = normalizeColor(winnerColor);
  if (!normalizedWinnerColor || typeof fen !== "string" || !fen) {
    return false;
  }

  try {
    const game = new Chess(fen);

    // If the whole position is already a dead draw, timeout should never award
    // a win to either side.
    if (game.isInsufficientMaterial()) {
      return true;
    }

    const loserColor = normalizedWinnerColor === "w" ? "b" : "w";
    const winner = getSideMaterialProfile(game, normalizedWinnerColor);
    const loser = getSideMaterialProfile(game, loserColor);

    // Lone king can never win on time.
    if (winner.bareKing) {
      return true;
    }

    // Common timeout draw cases used by major servers:
    // K+N vs K+Q, and K+B vs K+R / K+Q.
    if (
      winner.nonKing === 1 &&
      winner.counts.n === 1 &&
      loser.nonKing === 1 &&
      loser.counts.q === 1
    ) {
      return true;
    }

    if (
      winner.nonKing === 1 &&
      winner.counts.b === 1 &&
      loser.nonKing === 1 &&
      (loser.counts.r === 1 || loser.counts.q === 1)
    ) {
      return true;
    }

    return false;
  } catch {
    // If we cannot parse or inspect the position safely, preserve the existing
    // timeout-win behavior rather than creating a false draw.
    return false;
  }
}
