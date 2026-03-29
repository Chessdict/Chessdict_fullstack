import { describe, it, expect } from "vitest";
import { buildEventLeaderboard } from "../src/lib/server/leaderboard.ts";

function player(id, walletAddress, username = null) {
  return {
    id,
    walletAddress,
    username,
    bulletRating: 1200 + id,
    blitzRating: 1300 + id,
    rapidRating: 1400 + id,
    stakedRating: 1500 + id,
  };
}

describe("event leaderboard aggregation", () => {
  it("ranks by points, then wins, then staked wins", () => {
    const alice = player(1, "0xalice", "alice");
    const bob = player(2, "0xbob", "bob");
    const carol = player(3, "0xcarol", "carol");

    const leaderboard = buildEventLeaderboard([
      {
        id: "g1",
        status: "COMPLETED",
        onChainGameId: null,
        stakeToken: null,
        wagerAmount: null,
        updatedAt: new Date(),
        whitePlayer: alice,
        blackPlayer: bob,
        winnerId: alice.id,
      },
      {
        id: "g2",
        status: "DRAW",
        onChainGameId: null,
        stakeToken: null,
        wagerAmount: null,
        updatedAt: new Date(),
        whitePlayer: bob,
        blackPlayer: carol,
        winnerId: null,
      },
      {
        id: "g3",
        status: "COMPLETED",
        onChainGameId: "42",
        stakeToken: "0xtoken",
        wagerAmount: 10,
        updatedAt: new Date(),
        whitePlayer: carol,
        blackPlayer: alice,
        winnerId: carol.id,
      },
    ]);

    expect(leaderboard.map((entry) => entry.username)).toEqual(["carol", "alice", "bob"]);

    expect(leaderboard[0]).toMatchObject({
      username: "carol",
      points: 1.5,
      wins: 1,
      draws: 1,
      games: 2,
      stakedWins: 1,
      stakedGames: 1,
    });

    expect(leaderboard[1]).toMatchObject({
      username: "alice",
      points: 1,
      wins: 1,
      losses: 1,
      draws: 0,
      stakedWins: 0,
      stakedGames: 1,
    });
  });

  it("counts draws for both players and rounds win rate", () => {
    const alice = player(1, "0xalice", "alice");
    const bob = player(2, "0xbob", "bob");

    const leaderboard = buildEventLeaderboard([
      {
        id: "g1",
        status: "DRAW",
        onChainGameId: null,
        stakeToken: null,
        wagerAmount: null,
        updatedAt: new Date(),
        whitePlayer: alice,
        blackPlayer: bob,
        winnerId: null,
      },
    ]);

    expect(leaderboard).toHaveLength(2);
    expect(leaderboard[0].points).toBe(0.5);
    expect(leaderboard[0].draws).toBe(1);
    expect(leaderboard[0].winRate).toBe(0);
  });
});
