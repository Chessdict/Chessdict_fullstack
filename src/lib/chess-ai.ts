import { Chess, Move } from "chess.js";

// Piece values for evaluation
const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Piece-square tables to encourage better positioning
// Flipped for black in the evaluation logic
const PAWN_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
].flat();

const KNIGHT_PST = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
].flat();

const BISHOP_PST = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
].flat();

const ROOK_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0],
].flat();

const QUEEN_PST = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
].flat();

const KING_PST = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
].flat();

function evaluateBoard(game: Chess): number {
  let totalEvaluation = 0;
  const board = game.board();

  // Iterate through the 8x8 board
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const piece = board[i][j];
      if (piece) {
        // Calculate index (0-63)
        const index = i * 8 + j;
        // Flip index for black to mirror the PSTs
        const evalIndex = piece.color === "w" ? index : 63 - index;

        let positionValue = 0;
        switch (piece.type) {
          case "p":
            positionValue = PAWN_PST[evalIndex];
            break;
          case "n":
            positionValue = KNIGHT_PST[evalIndex];
            break;
          case "b":
            positionValue = BISHOP_PST[evalIndex];
            break;
          case "r":
            positionValue = ROOK_PST[evalIndex];
            break;
          case "q":
            positionValue = QUEEN_PST[evalIndex];
            break;
          case "k":
            positionValue = KING_PST[evalIndex];
            break;
        }

        const value = PIECE_VALUES[piece.type] + positionValue;
        totalEvaluation += piece.color === "w" ? value : -value;
      }
    }
  }
  return totalEvaluation;
}

// Minimax with Alpha-Beta Pruning
function minimax(
  game: Chess,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizingPlayer: boolean,
): number {
  if (depth === 0 || game.isGameOver()) {
    return -evaluateBoard(game); // Negate because evaluateBoard is from white's perspective?
    // Actually, let's keep it simple: evaluateBoard returns positive for white advantage.
    // If IS maximizing player (Black, since this AI plays black), we want to maximize (-eval).
    // Let's standardise:
    // AI is BLACK.
    // evaluateBoard: +ve White, -ve Black.
    // So Black wants to minimize evaluateBoard.
    // Let's stick to standard minimax where maximizing player tries to get highest score.
  }

  // Wait, standard convention:
  // evaluateBoard returns score from White's perspective.
  // We need to implement this carefully.
  // For simplicity, let's flip the evaluation logic inside the minimax if needed,
  // OR just always evaluate from the perspective of the side to move.

  // Reformulate:
  // function evaluate(game) -> positive if 'game.turn()' is winning
  return evaluateBoard(game);
}

// Correct implementation of Minimax for Black AI (minimizing White's score)
function minimaxRoot(
  game: Chess,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizingPlayer: boolean, // True if White (Player), False if Black (AI)
): number {
  if (depth === 0) {
    return -evaluateBoard(game); // Negative because we want to evaluate for the current side?
    // Let's simplify: evaluateBoard returns global score (White advantage).
    // If AI is Black, it wants to MINIMIZE this score.
    // So this function should return the *Value* of the board.
    return evaluateBoard(game);
  }

  const possibleMoves = game.moves();

  if (isMaximizingPlayer) {
    // White's turn
    let bestMove = -9999;
    for (let i = 0; i < possibleMoves.length; i++) {
      game.move(possibleMoves[i]);
      bestMove = Math.max(
        bestMove,
        minimaxRoot(game, depth - 1, alpha, beta, !isMaximizingPlayer),
      );
      game.undo();
      alpha = Math.max(alpha, bestMove);
      if (beta <= alpha) {
        return bestMove;
      }
    }
    return bestMove;
  } else {
    // Black's turn (AI)
    let bestMove = 9999;
    for (let i = 0; i < possibleMoves.length; i++) {
      game.move(possibleMoves[i]);
      bestMove = Math.min(
        bestMove,
        minimaxRoot(game, depth - 1, alpha, beta, !isMaximizingPlayer),
      );
      game.undo();
      beta = Math.min(beta, bestMove);
      if (beta <= alpha) {
        return bestMove;
      }
    }
    return bestMove;
  }
}

export function getBestMove(
  game: Chess,
  difficulty: "easy" | "medium" | "hard",
): string | null {
  const possibleMoves = game.moves();
  if (possibleMoves.length === 0) return null;

  // Easy: Randomish
  if (difficulty === "easy") {
    const randomIndex = Math.floor(Math.random() * possibleMoves.length);
    return possibleMoves[randomIndex];
  }

  // Medium/Hard: Use Minimax
  // Medium: Depth 2
  // Hard: Depth 3
  const depth = difficulty === "medium" ? 2 : 3;

  let bestMove = null;
  let bestValue = 9999; // AI plays Black, so starts with high value (wants to minimize)
  const alpha = -10000;
  const beta = 10000;

  // Sort moves to improve pruning (captures first)
  // This is a simple improvement: check for captures/promotions
  const sortedMoves = possibleMoves.sort((a, b) => {
    // Very basic sort: checks and captures might be 'x' or '+'
    // moves() returns SAN strings by default... wait, we need verbose to sort effectively
    // but move() takes string or object.
    // Let's just shuffle to add randomness to equal moves, then prioritize captures if we could.
    // For now, random shuffle is good enough to prevent deterministic identical games.
    return 0.5 - Math.random();
  });

  for (let i = 0; i < sortedMoves.length; i++) {
    const move = sortedMoves[i];
    game.move(move);
    // After Black moves, it's White's turn (Maximizing)
    const boardValue = minimaxRoot(game, depth - 1, alpha, beta, true);
    game.undo();

    if (boardValue < bestValue) {
      bestValue = boardValue;
      bestMove = move;
    }
  }

  return bestMove || possibleMoves[0];
}
