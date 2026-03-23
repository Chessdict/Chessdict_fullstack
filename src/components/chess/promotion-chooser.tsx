import { useEffect } from "react";

import {
  PROMOTION_PIECES,
  type PromotionPiece,
} from "@/lib/chess-promotion";

type PromotionChooserProps = {
  targetSquare: string;
  color: "white" | "black";
  orientation: "white" | "black";
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
};

const FILES = "abcdefgh";
const PIECE_LABELS: Record<PromotionPiece, string> = {
  q: "Queen",
  n: "Knight",
  r: "Rook",
  b: "Bishop",
};

function getBoardColumn(square: string, orientation: "white" | "black") {
  const fileIndex = FILES.indexOf(square[0]);
  if (fileIndex < 0) return 0;
  return orientation === "white" ? fileIndex : 7 - fileIndex;
}

function getBoardRow(square: string, orientation: "white" | "black") {
  const rank = Number(square[1]);
  if (Number.isNaN(rank)) return 0;
  return orientation === "white" ? 8 - rank : rank - 1;
}

export function PromotionChooser({
  targetSquare,
  color,
  orientation,
  onSelect,
  onCancel,
}: PromotionChooserProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const column = getBoardColumn(targetSquare, orientation);
  const row = getBoardRow(targetSquare, orientation);
  const direction = row === 0 ? 1 : -1;
  const pieceColor = color === "white" ? "w" : "b";

  return (
    <div
      className="absolute inset-0 z-30"
      onClick={onCancel}
      role="presentation"
    >
      <div className="absolute inset-0 bg-black/20" />
      {PROMOTION_PIECES.map((piece, index) => {
        const pieceRow = row + direction * index;
        const pieceCode = `${pieceColor}${piece.toUpperCase()}` as const;

        return (
          <button
            key={piece}
            type="button"
            aria-label={`Promote to ${PIECE_LABELS[piece]}`}
            className="absolute flex items-center justify-center border border-black/20 bg-[#f7f2e0] shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition hover:bg-white"
            style={{
              left: `${column * 12.5}%`,
              top: `${pieceRow * 12.5}%`,
              width: "12.5%",
              height: "12.5%",
            }}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(piece);
            }}
          >
            <img
              src={`/pieces/${pieceCode}.svg`}
              alt={PIECE_LABELS[piece]}
              draggable={false}
              className="h-[78%] w-[78%] object-contain pointer-events-none select-none"
            />
          </button>
        );
      })}
    </div>
  );
}
