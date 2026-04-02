"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BOARD_THEME_STORAGE_KEY,
  DEFAULT_BOARD_THEME,
  getBoardTheme,
  isBoardThemePreference,
  type BoardThemePreference,
} from "@/lib/board-theme";

export function useBoardTheme() {
  const [preference, setPreference] = useState<BoardThemePreference>("green");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(BOARD_THEME_STORAGE_KEY);
    if (isBoardThemePreference(stored)) {
      setPreference(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== BOARD_THEME_STORAGE_KEY) return;
      if (isBoardThemePreference(event.newValue)) {
        setPreference(event.newValue);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setBoardTheme = useCallback((nextPreference: BoardThemePreference) => {
    setPreference(nextPreference);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BOARD_THEME_STORAGE_KEY, nextPreference);
    }
  }, []);

  return {
    boardThemePreference: preference,
    boardTheme: getBoardTheme(preference) ?? DEFAULT_BOARD_THEME,
    setBoardTheme,
  };
}
