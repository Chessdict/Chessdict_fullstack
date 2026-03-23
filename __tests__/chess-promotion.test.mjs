import { describe, expect, test } from "vitest";
import { Chess } from "chess.js";

import { getPromotionSelection } from "../src/lib/chess-promotion";

describe("chess promotion helper", () => {
  test("detects a white promotion move", () => {
    const game = new Chess("7k/P7/8/8/8/8/8/K7 w - - 0 1");

    expect(getPromotionSelection(game, "a7", "a8")).toEqual({
      from: "a7",
      to: "a8",
      color: "white",
    });
  });

  test("returns null for a normal pawn move", () => {
    const game = new Chess();

    expect(getPromotionSelection(game, "e2", "e4")).toBeNull();
  });
});
