const PIECE_ORDER = ["Q", "R", "B", "N", "P"] as const;

const STARTING_COUNTS: Record<(typeof PIECE_ORDER)[number], number> = {
  Q: 1,
  R: 2,
  B: 2,
  N: 2,
  P: 8,
};

const PIECE_VALUES: Record<(typeof PIECE_ORDER)[number], number> = {
  Q: 9,
  R: 5,
  B: 3,
  N: 3,
  P: 1,
};

type PieceType = (typeof PIECE_ORDER)[number];

export type SideColor = "white" | "black";

export type MaterialBalance = {
  whiteCaptured: string[];
  blackCaptured: string[];
  whiteAdvantage: number;
  blackAdvantage: number;
};

function createEmptyCounts(): Record<PieceType, number> {
  return {
    Q: 0,
    R: 0,
    B: 0,
    N: 0,
    P: 0,
  };
}

function expandPieces(color: "w" | "b", counts: Record<PieceType, number>) {
  const pieces: string[] = [];

  for (const pieceType of PIECE_ORDER) {
    for (let index = 0; index < counts[pieceType]; index += 1) {
      pieces.push(`${color}${pieceType}`);
    }
  }

  return pieces;
}

function getMaterialScore(counts: Record<PieceType, number>) {
  return PIECE_ORDER.reduce((total, pieceType) => {
    return total + counts[pieceType] * PIECE_VALUES[pieceType];
  }, 0);
}

export function getMaterialBalance(fen: string): MaterialBalance {
  const boardFen = fen.split(" ")[0] ?? "";
  const whiteCounts = createEmptyCounts();
  const blackCounts = createEmptyCounts();

  for (const char of boardFen) {
    if (!/[prnbqkPRNBQK]/.test(char)) continue;

    const pieceType = char.toUpperCase() as PieceType | "K";
    if (pieceType === "K") continue;

    if (char === char.toUpperCase()) {
      whiteCounts[pieceType] += 1;
    } else {
      blackCounts[pieceType] += 1;
    }
  }

  const whiteMissing = createEmptyCounts();
  const blackMissing = createEmptyCounts();

  for (const pieceType of PIECE_ORDER) {
    whiteMissing[pieceType] = STARTING_COUNTS[pieceType] - whiteCounts[pieceType];
    blackMissing[pieceType] = STARTING_COUNTS[pieceType] - blackCounts[pieceType];

    const cancelled = Math.min(whiteMissing[pieceType], blackMissing[pieceType]);
    whiteMissing[pieceType] -= cancelled;
    blackMissing[pieceType] -= cancelled;
  }

  const whiteMaterial = getMaterialScore(blackMissing);
  const blackMaterial = getMaterialScore(whiteMissing);

  return {
    whiteCaptured: expandPieces("b", blackMissing),
    blackCaptured: expandPieces("w", whiteMissing),
    whiteAdvantage: Math.max(0, whiteMaterial - blackMaterial),
    blackAdvantage: Math.max(0, blackMaterial - whiteMaterial),
  };
}

export function getSideMaterialDisplay(balance: MaterialBalance, side: SideColor) {
  return side === "white"
    ? {
        capturedPieces: balance.whiteCaptured,
        advantage: balance.whiteAdvantage,
      }
    : {
        capturedPieces: balance.blackCaptured,
        advantage: balance.blackAdvantage,
      };
}
