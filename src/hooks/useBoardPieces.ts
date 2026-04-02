"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MOBILE_PIECES_STORAGE_KEY,
  isMobilePiecesPreference,
  type MobilePiecesPreference,
} from "@/lib/board-pieces";

export function useBoardPieces() {
  const [mobilePiecesPreference, setMobilePiecesPreferenceState] =
    useState<MobilePiecesPreference>("default");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(MOBILE_PIECES_STORAGE_KEY);
    if (isMobilePiecesPreference(stored)) {
      setMobilePiecesPreferenceState(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== MOBILE_PIECES_STORAGE_KEY) return;
      if (isMobilePiecesPreference(event.newValue)) {
        setMobilePiecesPreferenceState(event.newValue);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setMobilePiecesPreference = useCallback((nextPreference: MobilePiecesPreference) => {
    setMobilePiecesPreferenceState(nextPreference);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MOBILE_PIECES_STORAGE_KEY, nextPreference);
    }
  }, []);

  return {
    mobilePiecesPreference,
    useCustomPiecesOnMobile: mobilePiecesPreference === "custom",
    setMobilePiecesPreference,
  };
}
