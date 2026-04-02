import { describe, expect, it } from "vitest";

import {
  calculateHeadToHeadGlicko,
  calculateGlickoMatch,
  inflateRdForInactivity,
} from "../lib/glicko-rating.mjs";

describe("glicko rating updates", () => {
  it("moves ratings in opposite directions after a decisive result", () => {
    const { white, black } = calculateHeadToHeadGlicko({
      whiteRating: 1500,
      whiteRd: 80,
      whiteLastGameAt: new Date("2026-04-01T12:00:00.000Z"),
      blackRating: 1500,
      blackRd: 80,
      blackLastGameAt: new Date("2026-04-01T12:00:00.000Z"),
      score: 1,
      now: new Date("2026-04-02T12:00:00.000Z"),
    });

    expect(white.rating).toBeGreaterThan(1500);
    expect(black.rating).toBeLessThan(1500);
    expect(white.rd).toBeLessThan(
      inflateRdForInactivity(
        80,
        new Date("2026-04-01T12:00:00.000Z"),
        new Date("2026-04-02T12:00:00.000Z"),
      ),
    );
    expect(black.rd).toBeLessThan(
      inflateRdForInactivity(
        80,
        new Date("2026-04-01T12:00:00.000Z"),
        new Date("2026-04-02T12:00:00.000Z"),
      ),
    );
  });

  it("widens RD after inactivity", () => {
    const activeRd = inflateRdForInactivity(
      80,
      new Date("2026-04-01T00:00:00.000Z"),
      new Date("2026-04-02T00:00:00.000Z"),
    );
    const inactiveRd = inflateRdForInactivity(
      80,
      new Date("2025-12-01T00:00:00.000Z"),
      new Date("2026-04-02T00:00:00.000Z"),
    );

    expect(inactiveRd).toBeGreaterThan(activeRd);
  });

  it("causes larger rating swings for inactive players with higher RD", () => {
    const active = calculateGlickoMatch({
      rating: 1500,
      rd: 80,
      lastGameAt: new Date("2026-04-01T00:00:00.000Z"),
      opponentRating: 1500,
      opponentRd: 80,
      opponentLastGameAt: new Date("2026-04-01T00:00:00.000Z"),
      score: 1,
      now: new Date("2026-04-02T00:00:00.000Z"),
    });
    const inactive = calculateGlickoMatch({
      rating: 1500,
      rd: 80,
      lastGameAt: new Date("2025-11-01T00:00:00.000Z"),
      opponentRating: 1500,
      opponentRd: 80,
      opponentLastGameAt: new Date("2026-04-01T00:00:00.000Z"),
      score: 1,
      now: new Date("2026-04-02T00:00:00.000Z"),
    });

    expect(inactive.rating - 1500).toBeGreaterThan(active.rating - 1500);
  });
});
