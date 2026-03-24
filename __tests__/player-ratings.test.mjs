import { describe, expect, it } from "vitest";

import {
  getAllRatings,
  getPlayerRatingForTimeControl,
  getRatingCategoryForTimeControl,
  getRatingFieldForTimeControl,
} from "../src/lib/player-ratings.ts";

describe("player rating helpers", () => {
  const player = {
    rating: 1200,
    bulletRating: 1095,
    blitzRating: 1320,
    rapidRating: 1460,
    stakedRating: 1385,
  };

  it("maps supported time controls to the expected category and field", () => {
    expect(getRatingCategoryForTimeControl(1)).toBe("Bullet");
    expect(getRatingCategoryForTimeControl(2)).toBe("Bullet");
    expect(getRatingCategoryForTimeControl(3)).toBe("Blitz");
    expect(getRatingCategoryForTimeControl(10)).toBe("Rapid");

    expect(getRatingFieldForTimeControl(1)).toBe("bulletRating");
    expect(getRatingFieldForTimeControl(3)).toBe("blitzRating");
    expect(getRatingFieldForTimeControl(10)).toBe("rapidRating");
    expect(getRatingFieldForTimeControl(3, true)).toBe("stakedRating");
  });

  it("returns the per-speed rating for the requested time control", () => {
    expect(getPlayerRatingForTimeControl(player, 1)).toBe(1095);
    expect(getPlayerRatingForTimeControl(player, 2)).toBe(1095);
    expect(getPlayerRatingForTimeControl(player, 3)).toBe(1320);
    expect(getPlayerRatingForTimeControl(player, 10)).toBe(1460);
    expect(getPlayerRatingForTimeControl(player, 1, true)).toBe(1385);
    expect(getPlayerRatingForTimeControl(player, 3, true)).toBe(1385);
  });

  it("falls back to the legacy rating when per-speed fields are missing", () => {
    expect(getPlayerRatingForTimeControl({ rating: 1275 }, 10)).toBe(1275);
    expect(getPlayerRatingForTimeControl(null, 3)).toBe(1200);
  });

  it("builds the profile ratings snapshot", () => {
    expect(getAllRatings(player)).toEqual({
      bullet: 1095,
      blitz: 1320,
      rapid: 1460,
      staked: 1385,
    });
  });
});
