import { describe, expect, it } from "vitest";
import { isTimeoutDrawByInsufficientWinningMaterial } from "../lib/timeout-material.mjs";

describe("timeout insufficient winning material", () => {
  it("draws when the side with time left only has a bare king", () => {
    expect(
      isTimeoutDrawByInsufficientWinningMaterial(
        "4k3/8/8/8/8/8/8/R3K3 w - - 0 1",
        "black",
      ),
    ).toBe(true);
  });

  it("draws for king and bishop against a bare king", () => {
    expect(
      isTimeoutDrawByInsufficientWinningMaterial(
        "4k3/8/8/8/8/8/8/3BK3 w - - 0 1",
        "white",
      ),
    ).toBe(true);
  });

  it("draws for king and knight against a bare king", () => {
    expect(
      isTimeoutDrawByInsufficientWinningMaterial(
        "4k3/8/8/8/8/8/8/3NK3 w - - 0 1",
        "white",
      ),
    ).toBe(true);
  });

  it("does not draw for king and two knights against a bare king", () => {
    expect(
      isTimeoutDrawByInsufficientWinningMaterial(
        "4k3/8/8/8/8/8/6N1/3NK3 w - - 0 1",
        "white",
      ),
    ).toBe(false);
  });

  it("draws for king and bishop against king and rook", () => {
    expect(
      isTimeoutDrawByInsufficientWinningMaterial(
        "4k2r/8/8/8/8/8/8/3BK3 w - - 0 1",
        "white",
      ),
    ).toBe(true);
  });

  it("draws for king and bishop against king and queen", () => {
    expect(
      isTimeoutDrawByInsufficientWinningMaterial(
        "4k2q/8/8/8/8/8/8/3BK3 w - - 0 1",
        "white",
      ),
    ).toBe(true);
  });

  it("draws for king and knight against king and queen", () => {
    expect(
      isTimeoutDrawByInsufficientWinningMaterial(
        "4k2q/8/8/8/8/8/8/3NK3 w - - 0 1",
        "white",
      ),
    ).toBe(true);
  });

  it("still awards the win when the side with time left has a bishop and the opponent has a pawn", () => {
    expect(
      isTimeoutDrawByInsufficientWinningMaterial(
        "4k3/8/8/8/8/8/p7/3BK3 w - - 0 1",
        "white",
      ),
    ).toBe(false);
  });
});
