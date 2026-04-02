const GLICKO_Q = Math.log(10) / 400;
const MIN_RATING = 100;
const MIN_RD = 30;
const MAX_RD = 350;
const DEFAULT_RD = 350;
const RATING_PERIOD_MS = 24 * 60 * 60 * 1000;
const RD_GROWTH_PER_PERIOD = Math.sqrt((MAX_RD ** 2 - 50 ** 2) / 100);

function clampRd(rd) {
  if (!Number.isFinite(rd)) return DEFAULT_RD;
  return Math.min(MAX_RD, Math.max(MIN_RD, rd));
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export function inflateRdForInactivity(rd, lastGameAt, now = new Date()) {
  const baselineRd = clampRd(rd);
  const lastPlayed = normalizeDate(lastGameAt);
  const nowDate = normalizeDate(now) ?? new Date();

  if (!lastPlayed) return baselineRd;

  const elapsedMs = Math.max(0, nowDate.getTime() - lastPlayed.getTime());
  if (elapsedMs <= 0) return baselineRd;

  const ratingPeriods = elapsedMs / RATING_PERIOD_MS;
  const inflated = Math.sqrt(
    baselineRd ** 2 + RD_GROWTH_PER_PERIOD ** 2 * ratingPeriods,
  );

  return Math.min(MAX_RD, inflated);
}

function g(rd) {
  return 1 / Math.sqrt(1 + (3 * GLICKO_Q ** 2 * rd ** 2) / Math.PI ** 2);
}

export function expectedScore(playerRating, opponentRating, opponentRd) {
  const opponentImpact = g(clampRd(opponentRd));
  return 1 / (
    1 + Math.pow(10, (-opponentImpact * (playerRating - opponentRating)) / 400)
  );
}

export function calculateGlickoMatch({
  rating,
  rd,
  lastGameAt,
  opponentRating,
  opponentRd,
  opponentLastGameAt,
  score,
  now = new Date(),
}) {
  const currentRd = inflateRdForInactivity(rd, lastGameAt, now);
  const currentOpponentRd = inflateRdForInactivity(opponentRd, opponentLastGameAt, now);
  const opponentImpact = g(currentOpponentRd);
  const expected = expectedScore(rating, opponentRating, currentOpponentRd);
  const dSquared =
    1 / (GLICKO_Q ** 2 * opponentImpact ** 2 * expected * (1 - expected));
  const denominator = (1 / currentRd ** 2) + (1 / dSquared);
  const newRd = Math.sqrt(1 / denominator);
  const newRating =
    rating + (GLICKO_Q / denominator) * opponentImpact * (score - expected);

  return {
    rating: Math.max(MIN_RATING, Math.round(newRating)),
    rd: clampRd(newRd),
    expected,
  };
}

export function calculateHeadToHeadGlicko({
  whiteRating,
  whiteRd,
  whiteLastGameAt,
  blackRating,
  blackRd,
  blackLastGameAt,
  score,
  now = new Date(),
}) {
  const white = calculateGlickoMatch({
    rating: whiteRating,
    rd: whiteRd,
    lastGameAt: whiteLastGameAt,
    opponentRating: blackRating,
    opponentRd: blackRd,
    opponentLastGameAt: blackLastGameAt,
    score,
    now,
  });
  const black = calculateGlickoMatch({
    rating: blackRating,
    rd: blackRd,
    lastGameAt: blackLastGameAt,
    opponentRating: whiteRating,
    opponentRd: whiteRd,
    opponentLastGameAt: whiteLastGameAt,
    score: 1 - score,
    now,
  });

  return { white, black };
}

export const GLICKO_DEFAULT_RD = DEFAULT_RD;
export const GLICKO_ESTABLISHED_RD = 125;
