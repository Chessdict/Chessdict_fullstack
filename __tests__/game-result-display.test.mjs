import { describe, expect, test } from "vitest";
import { Chess } from "chess.js";

import {
  formatGameReason,
  getAutomaticDrawReason,
} from "../src/lib/game-result-display";

describe("game result display", () => {
  test("detects threefold repetition for display", () => {
    const game = new Chess();

    [
      "Nf3",
      "Nf6",
      "Ng1",
      "Ng8",
      "Nf3",
      "Nf6",
      "Ng1",
      "Ng8",
    ].forEach((move) => game.move(move));

    expect(game.isThreefoldRepetition()).toBe(true);
    expect(getAutomaticDrawReason(game)).toBe("threefold_repetition");
  });

  test("formats specific draw reasons", () => {
    expect(formatGameReason("draw")).toBe("Draw by Agreement");
    expect(formatGameReason("threefold_repetition")).toBe(
      "Draw by Threefold Repetition",
    );
  });
});
