import { Chess } from "chess.js";

type ColorCode = "w" | "b";

export type Premove = {
  from: string;
  to: string;
  promotion: "q";
};

type SquarePosition = {
  file: number;
  rank: number;
};

const FILES = "abcdefgh";

function parseSquare(square: string): SquarePosition | null {
  if (square.length !== 2) return null;

  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);

  if (file < 0 || Number.isNaN(rank) || rank < 1 || rank > 8) {
    return null;
  }

  return { file, rank };
}

function isDifferentSquare(from: SquarePosition, to: SquarePosition): boolean {
  return from.file !== to.file || from.rank !== to.rank;
}

function diff(a: number, b: number): number {
  return Math.abs(a - b);
}

function canPremovePawn(color: ColorCode, from: SquarePosition, to: SquarePosition): boolean {
  const fileDiff = diff(from.file, to.file);
  const rankDiff = to.rank - from.rank;

  if (color === "w") {
    return (
      fileDiff < 2 &&
      (rankDiff === 1 || (from.rank === 2 && rankDiff === 2 && fileDiff === 0))
    );
  }

  return (
    fileDiff < 2 &&
    (rankDiff === -1 || (from.rank === 7 && rankDiff === -2 && fileDiff === 0))
  );
}

function canPremoveKnight(from: SquarePosition, to: SquarePosition): boolean {
  const fileDiff = diff(from.file, to.file);
  const rankDiff = diff(from.rank, to.rank);

  return (
    (fileDiff === 1 && rankDiff === 2) ||
    (fileDiff === 2 && rankDiff === 1)
  );
}

function canPremoveBishop(from: SquarePosition, to: SquarePosition): boolean {
  return diff(from.file, to.file) === diff(from.rank, to.rank);
}

function canPremoveRook(from: SquarePosition, to: SquarePosition): boolean {
  return from.file === to.file || from.rank === to.rank;
}

function canPremoveQueen(from: SquarePosition, to: SquarePosition): boolean {
  return canPremoveBishop(from, to) || canPremoveRook(from, to);
}

function canPremoveCastle(game: Chess, color: ColorCode, from: string, to: string): boolean {
  const homeRank = color === "w" ? "1" : "8";
  if (from !== `e${homeRank}`) return false;

  if (to === `g${homeRank}`) {
    const rook = game.get(`h${homeRank}` as never);
    return rook?.type === "r" && rook.color === color;
  }

  if (to === `c${homeRank}`) {
    const rook = game.get(`a${homeRank}` as never);
    return rook?.type === "r" && rook.color === color;
  }

  return false;
}

function canPremoveKing(game: Chess, color: ColorCode, from: string, to: string): boolean {
  const fromPos = parseSquare(from);
  const toPos = parseSquare(to);

  if (!fromPos || !toPos) return false;

  return (
    (diff(fromPos.file, toPos.file) < 2 && diff(fromPos.rank, toPos.rank) < 2) ||
    canPremoveCastle(game, color, from, to)
  );
}

export function canSetPremove(game: Chess, from: string, to: string): boolean {
  const piece = game.get(from as never);
  if (!piece) return false;

  const fromPos = parseSquare(from);
  const toPos = parseSquare(to);

  if (!fromPos || !toPos || !isDifferentSquare(fromPos, toPos)) {
    return false;
  }

  switch (piece.type) {
    case "p":
      return canPremovePawn(piece.color, fromPos, toPos);
    case "n":
      return canPremoveKnight(fromPos, toPos);
    case "b":
      return canPremoveBishop(fromPos, toPos);
    case "r":
      return canPremoveRook(fromPos, toPos);
    case "q":
      return canPremoveQueen(fromPos, toPos);
    case "k":
      return canPremoveKing(game, piece.color, from, to);
    default:
      return false;
  }
}

export function getPremoveTargets(game: Chess, from: string): string[] {
  const targets: string[] = [];

  for (const file of FILES) {
    for (let rank = 1; rank <= 8; rank += 1) {
      const target = `${file}${rank}`;
      if (canSetPremove(game, from, target)) {
        targets.push(target);
      }
    }
  }

  return targets;
}
