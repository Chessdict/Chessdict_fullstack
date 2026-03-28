"use client";

import { useCallback, useEffect } from "react";

function playFile(path: string, volume = 0.8) {
  const audio = new Audio(path);
  audio.volume = volume;
  audio.play().catch(() => { });
}

export function useChessSounds() {

  const playMove = useCallback(() => playFile("/sounds/MOVED PIECE..mp3"), []);
  const playCapture = useCallback(() => playFile("/sounds/GAME STOP.mp3"), []);
  const playCheck = useCallback(() => playFile("/sounds/GAME STOP.mp3"), []);
  const playPromotion = useCallback(() => playFile("/sounds/WHEN YOU PROMOTE.mp3"), []);
  const playGameOver = useCallback(() => playFile("/sounds/CHECKMATE.mp3"), []);
  const playNotification = useCallback(() => playFile("/sounds/NOTIFICATION.mp3"), []);
  const playTimeOut = useCallback(() => playFile("/sounds/TIME OUT.mp3"), []);
  const playWhenCastle = useCallback(() => playFile("/sounds/WHEN YOU CASTLE.mp3"), []);
  const playOpponentMove = useCallback(() => playFile("/sounds/MOVED OPPONENT PIECE.mp3"), []);

  const playMoveSound = useCallback((move: { san: string; captured?: string; flags?: string }) => {
    const isPromotion = move.flags?.includes("p") || move.san.includes("=");
    const isCheck = move.san.includes("+") || move.san.includes("#");
    const isCapture = !!move.captured;
    const isCastle = move.flags?.includes("k") || move.flags?.includes("q");

    if (isPromotion) playPromotion();
    else if (isCheck) playCheck();
    else if (isCapture) playCapture();
    else if (isCastle) playWhenCastle();
    else playMove();
  }, [playMove, playCapture, playCheck, playPromotion, playWhenCastle]);

  return { playMove, playCapture, playCheck, playPromotion, playGameOver, playNotification, playTimeOut, playWhenCastle, playOpponentMove, playMoveSound };
}
