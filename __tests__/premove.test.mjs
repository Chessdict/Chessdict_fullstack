import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";

import { canSetPremove, getPremoveTargets } from "../src/lib/premove.ts";

describe("premove helper", () => {
  it("allows pawn premoves by geometry, including diagonal intents", () => {
    const game = new Chess("4k3/8/8/8/8/8/4P3/4K3 b - - 0 1");

    expect(getPremoveTargets(game, "e2")).toEqual(
      expect.arrayContaining(["d3", "e3", "e4", "f3"]),
    );
  });

  it("allows bishop premoves through blockers like lichess", () => {
    const game = new Chess();

    expect(canSetPremove(game, "c1", "h6")).toBe(true);
    expect(getPremoveTargets(game, "c1")).toContain("h6");
  });

  it("allows castling premoves when the home rook is present", () => {
    const game = new Chess();

    expect(canSetPremove(game, "e1", "g1")).toBe(true);
    expect(canSetPremove(game, "e1", "c1")).toBe(true);
  });

  it("rejects same-square and missing-piece premoves", () => {
    const game = new Chess();

    expect(canSetPremove(game, "e2", "e2")).toBe(false);
    expect(canSetPremove(game, "e5", "e6")).toBe(false);
  });
});
