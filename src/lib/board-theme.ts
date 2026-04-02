export const BOARD_THEME_STORAGE_KEY = "chessdict.boardTheme";

export type BoardThemePreference = "green" | "classic";

export const BOARD_THEMES = {
  green: {
    id: "green" as const,
    label: "Green",
    darkSquareStyle: { backgroundColor: "#779556" },
    lightSquareStyle: { backgroundColor: "#EBECD0" },
  },
  classic: {
    id: "classic" as const,
    label: "Classic",
    darkSquareStyle: { backgroundColor: "#B58863" },
    lightSquareStyle: { backgroundColor: "#F0D9B5" },
  },
} as const;

export function isBoardThemePreference(value: unknown): value is BoardThemePreference {
  return value === "green" || value === "classic";
}

export function getBoardTheme(preference: BoardThemePreference) {
  return BOARD_THEMES[preference] ?? BOARD_THEMES.green;
}

export const DEFAULT_BOARD_THEME = BOARD_THEMES.green;
