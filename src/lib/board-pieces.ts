export const MOBILE_PIECES_STORAGE_KEY = "chessdict.mobilePieces";

export type MobilePiecesPreference = "default" | "custom";

export const MOBILE_PIECES_OPTIONS = {
  default: {
    id: "default" as const,
    label: "Default",
    description: "Use the current stable mobile pieces.",
  },
  custom: {
    id: "custom" as const,
    label: "Custom",
    description: "Use Chessdict custom pieces on mobile too.",
  },
} as const;

export function isMobilePiecesPreference(value: unknown): value is MobilePiecesPreference {
  return value === "default" || value === "custom";
}
