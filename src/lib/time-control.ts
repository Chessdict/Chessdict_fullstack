export type TimeControlCategory = "Bullet" | "Blitz" | "Rapid";

export type TimeControlOption = {
  minutes: number;
  value: string;
  label: string;
  category: TimeControlCategory;
  badgeLabel: string;
};

export const DEFAULT_QUEUE_TIME_CONTROL_MINUTES = 3;
export const MAX_STAKED_TIME_CONTROL_MINUTES = 3;

export const TIME_CONTROL_OPTIONS: TimeControlOption[] = [
  {
    minutes: 1,
    value: "1",
    label: "1 min",
    category: "Bullet",
    badgeLabel: "• Bullet",
  },
  {
    minutes: 2,
    value: "2",
    label: "2 min",
    category: "Bullet",
    badgeLabel: "• Bullet",
  },
  {
    minutes: 3,
    value: "3",
    label: "3 min",
    category: "Blitz",
    badgeLabel: "⚡ Blitz",
  },
  {
    minutes: 10,
    value: "10",
    label: "10 min",
    category: "Rapid",
    badgeLabel: "Rapid",
  },
];

export function normalizeTimeControlMinutes(value?: number | string | null): number {
  const numericValue =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(numericValue)) {
    return DEFAULT_QUEUE_TIME_CONTROL_MINUTES;
  }

  const option = TIME_CONTROL_OPTIONS.find((entry) => entry.minutes === numericValue);
  return option?.minutes ?? DEFAULT_QUEUE_TIME_CONTROL_MINUTES;
}

export function getTimeControlOption(minutes?: number | string | null): TimeControlOption {
  const normalizedMinutes = normalizeTimeControlMinutes(minutes);
  return (
    TIME_CONTROL_OPTIONS.find((entry) => entry.minutes === normalizedMinutes) ??
    TIME_CONTROL_OPTIONS.find((entry) => entry.minutes === DEFAULT_QUEUE_TIME_CONTROL_MINUTES)!
  );
}

export function getTimeControlOptions(maxMinutes?: number): TimeControlOption[] {
  if (!maxMinutes) return TIME_CONTROL_OPTIONS;
  return TIME_CONTROL_OPTIONS.filter((entry) => entry.minutes <= maxMinutes);
}

export function getTimeControlSeconds(minutes?: number | string | null): number {
  return normalizeTimeControlMinutes(minutes) * 60;
}

export function clampStakedTimeControlMinutes(minutes?: number | string | null): number {
  return Math.min(normalizeTimeControlMinutes(minutes), MAX_STAKED_TIME_CONTROL_MINUTES);
}

export function getTimeControlDisplay(minutes?: number | string | null): string {
  const option = getTimeControlOption(minutes);
  return `${option.badgeLabel} · ${option.label}`;
}

export function getTimeControlMinutesFromSeconds(seconds: number): number {
  return normalizeTimeControlMinutes(Math.round(seconds / 60));
}
