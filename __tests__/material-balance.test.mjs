import { describe, expect, it } from "vitest";

import {
  getMaterialBalance,
  getSideMaterialDisplay,
} from "../src/lib/material-balance";

describe("material balance", () => {
  it("shows a captured black pawn for white after 1. e4 d5 2. exd5", () => {
    const balance = getMaterialBalance(
      "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2",
    );

    expect(balance.whiteCaptured).toEqual(["bP"]);
    expect(balance.blackCaptured).toEqual([]);
    expect(balance.whiteAdvantage).toBe(1);
    expect(balance.blackAdvantage).toBe(0);
  });

  it("cancels equal exchanges instead of showing all captured pieces", () => {
    const balance = getMaterialBalance(
      "rnb1k1nr/pppp1ppp/8/8/8/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1",
    );

    expect(balance.whiteCaptured).toEqual([]);
    expect(balance.blackCaptured).toEqual([]);
    expect(balance.whiteAdvantage).toBe(0);
    expect(balance.blackAdvantage).toBe(0);
  });

  it("returns the row display for a specific side", () => {
    const balance = getMaterialBalance(
      "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2",
    );

    expect(getSideMaterialDisplay(balance, "white")).toEqual({
      capturedPieces: ["bP"],
      advantage: 1,
    });
    expect(getSideMaterialDisplay(balance, "black")).toEqual({
      capturedPieces: [],
      advantage: 0,
    });
  });
});
