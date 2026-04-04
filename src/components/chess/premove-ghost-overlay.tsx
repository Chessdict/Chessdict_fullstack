"use client";

import { defaultPieces } from "react-chessboard";
import { customPieces } from "@/components/chess/custom-pieces";

const PREMOVE_SOURCE_FILL = "#9FD9A6";
const PREMOVE_SOURCE_RING = "rgba(22, 101, 52, 0.28)";
const PREMOVE_TARGET_RING = "rgba(22, 101, 52, 0.46)";
const PREMOVE_TARGET_FILL = "#74C987";
const PREMOVE_GHOST_OPACITY = 0.96;
const CUSTOM_GHOST_SCALE = 0.9;

function getSquarePosition(square: string, orientation: "white" | "black") {
  const file = square.charCodeAt(0) - 97;
  const rank = Number.parseInt(square[1] ?? "", 10);

  if (file < 0 || file > 7 || rank < 1 || rank > 8) {
    return null;
  }

  const leftIndex = orientation === "white" ? file : 7 - file;
  const topIndex = orientation === "white" ? 8 - rank : rank - 1;

  return {
    left: `${leftIndex * 12.5}%`,
    top: `${topIndex * 12.5}%`,
  };
}

interface PremoveGhostOverlayProps {
  from: string;
  to: string;
  orientation: "white" | "black";
  pieceCode: string | null;
  useDefaultPieces?: boolean;
}

export function PremoveGhostOverlay({
  from,
  to,
  orientation,
  pieceCode,
  useDefaultPieces = false,
}: PremoveGhostOverlayProps) {
  if (!pieceCode) return null;

  const pieceSet = useDefaultPieces ? defaultPieces : customPieces;
  const renderPiece = pieceSet[pieceCode];
  if (!renderPiece) return null;

  const sourcePosition = getSquarePosition(from, orientation);
  const targetPosition = getSquarePosition(to, orientation);
  if (!sourcePosition || !targetPosition) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div
        style={{
          position: "absolute",
          width: "12.5%",
          height: "12.5%",
          left: sourcePosition.left,
          top: sourcePosition.top,
          backgroundColor: PREMOVE_SOURCE_FILL,
          boxShadow: `inset 0 0 0 2px ${PREMOVE_SOURCE_RING}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "12.5%",
          height: "12.5%",
          left: targetPosition.left,
          top: targetPosition.top,
          backgroundColor: PREMOVE_TARGET_FILL,
          boxShadow: `inset 0 0 0 2px ${PREMOVE_TARGET_RING}`,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div
          style={{
            width: useDefaultPieces ? "100%" : `${CUSTOM_GHOST_SCALE * 100}%`,
            height: useDefaultPieces ? "100%" : `${CUSTOM_GHOST_SCALE * 100}%`,
            display: "grid",
            placeItems: "center",
          }}
        >
          {renderPiece({
            svgStyle: {
              opacity: PREMOVE_GHOST_OPACITY,
              filter: "saturate(1.02) brightness(1.04)",
            },
          })}
        </div>
      </div>
    </div>
  );
}
