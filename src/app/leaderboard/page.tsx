import Image from "next/image";
import { Crown, Medal, Trophy } from "lucide-react";
import {
  getTodayLeaderboard,
} from "@/lib/server/leaderboard";
import { formatWalletAddress } from "@/lib/utils";

export const dynamic = "force-dynamic";

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) {
    return <Crown className="h-4 w-4 text-amber-300" />;
  }

  if (rank === 2 || rank === 3) {
    return <Medal className="h-4 w-4 text-white/70" />;
  }

  return <Trophy className="h-4 w-4 text-white/40" />;
}

export default async function LeaderboardPage() {
  const leaderboard = await getTodayLeaderboard();
  const loser = leaderboard.loser;

  return (
    <main className="min-h-screen bg-black px-4 pb-16 pt-28 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                Event Leaderboard
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                April 5 Window
              </h1>
              <p className="max-w-2xl text-sm text-white/65 sm:text-base">
                Ranked by standard points from completed games between 7:30 PM and 9:30 PM WAT on April 5, 2026.
                Wins count as 1 point and draws count as 0.5. The staked column still shows performance in staked games inside the same window.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70">
              {leaderboard.window.label}
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-white/40">Players Ranked</p>
            <p className="mt-2 text-2xl font-semibold text-white">{leaderboard.totalPlayers}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-white/40">Games Counted</p>
            <p className="mt-2 text-2xl font-semibold text-white">{leaderboard.totalGames}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-white/40">Time Zone</p>
            <p className="mt-2 text-2xl font-semibold text-white">WAT</p>
          </div>
        </section>

        {loser ? (
          <section className="rounded-3xl border border-rose-400/15 bg-rose-500/[0.06] p-6 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-200/80">
                  Tournament Loser
                </p>
                <h2 className="text-2xl font-semibold text-white">
                  Most losses, fewest wins
                </h2>
                <p className="max-w-2xl text-sm text-white/65">
                  This callout highlights the player who had the roughest staked run in this window.
                </p>
              </div>

              <div className="flex min-w-0 items-center gap-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-4">
                <div className="relative h-16 w-16 overflow-hidden rounded-full border border-white/10 bg-white/5">
                  <Image
                    src={loser.memoji}
                    alt={loser.displayName}
                    fill
                    className="object-contain"
                    sizes="64px"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-white">
                    {loser.displayName}
                  </p>
                  <p className="truncate text-xs text-white/45">
                    {formatWalletAddress(loser.walletAddress)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/70">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                      {loser.losses} losses
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                      {loser.wins} wins
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                      {loser.games} games
                    </span>
                    <span className="rounded-full border border-rose-300/15 bg-rose-400/10 px-2.5 py-1 text-rose-100">
                      {loser.points % 1 === 0 ? loser.points.toFixed(0) : loser.points.toFixed(1)} pts
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {leaderboard.entries.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-8 text-center text-white/60">
            No completed games landed inside this event window yet.
          </section>
        ) : (
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
            <div className="hidden grid-cols-[88px_minmax(0,1.7fr)_repeat(6,minmax(0,1fr))] gap-4 border-b border-white/10 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/45 lg:grid">
              <div>Rank</div>
              <div>Player</div>
              <div>Points</div>
              <div>Wins</div>
              <div>Draws</div>
              <div>Losses</div>
              <div>Games</div>
              <div>Staked</div>
            </div>

            <div className="divide-y divide-white/10">
              {leaderboard.entries.map((entry, index) => {
                const rank = index + 1;

                return (
                  <div
                    key={entry.id}
                    className="grid gap-4 px-5 py-5 lg:grid-cols-[88px_minmax(0,1.7fr)_repeat(6,minmax(0,1fr))] lg:items-center lg:px-6"
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <RankIcon rank={rank} />
                      <span>#{rank}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="relative h-12 w-12 overflow-hidden rounded-full border border-white/10 bg-white/5">
                        <Image
                          src={entry.memoji}
                          alt={entry.displayName}
                          fill
                          className="object-contain"
                          sizes="48px"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{entry.displayName}</p>
                        <p className="truncate text-xs text-white/45">{formatWalletAddress(entry.walletAddress)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-sm lg:contents">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-white/35 lg:hidden">Points</p>
                        <p className="text-base font-semibold text-emerald-300">
                          {entry.points % 1 === 0 ? entry.points.toFixed(0) : entry.points.toFixed(1)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-white/35 lg:hidden">Wins</p>
                        <p className="text-sm text-white">{entry.wins}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-white/35 lg:hidden">Draws</p>
                        <p className="text-sm text-white">{entry.draws}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-white/35 lg:hidden">Losses</p>
                        <p className="text-sm text-white">{entry.losses}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-white/35 lg:hidden">Games</p>
                        <p className="text-sm text-white">
                          {entry.games}
                          <span className="ml-2 text-xs text-white/45">{entry.winRate}% win rate</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-white/35 lg:hidden">Staked</p>
                        <p className="text-sm text-white">
                          {entry.stakedWins}/{entry.stakedGames}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
