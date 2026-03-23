import { describe, expect, it } from "vitest";

import {
  clampStakedTimeControlMinutes,
  getTimeControlDisplay,
  getTimeControlOptions,
} from "../src/lib/time-control.ts";

describe("time control helpers", () => {
  it("caps staked time control at 3 minutes", () => {
    expect(clampStakedTimeControlMinutes(10)).toBe(3);
    expect(clampStakedTimeControlMinutes(3)).toBe(3);
    expect(clampStakedTimeControlMinutes(2)).toBe(2);
  });

  it("filters selectable options for capped staked games", () => {
    expect(getTimeControlOptions(3).map((option) => option.minutes)).toEqual([1, 2, 3]);
  });

  it("keeps the expected labels", () => {
    expect(getTimeControlDisplay(1)).toBe("• Bullet · 1 min");
    expect(getTimeControlDisplay(3)).toBe("⚡ Blitz · 3 min");
    expect(getTimeControlDisplay(10)).toBe("Rapid · 10 min");
  });
});
