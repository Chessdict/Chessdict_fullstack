import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Minus, Target, Trophy, TrendingUp } from "lucide-react";
import { getPublicPlayerProfile } from "@/lib/server/public-player";
import { formatWalletAddress, getDisplayName } from "@/lib/utils";
import { getTimeControlDisplay } from "@/lib/time-control";

export const dynamic = "force-dynamic";

function formatStakeAmount(amount: number | null) {
  if (amount == null) return null;
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(amount);
  return `${formatted} USD`;
}

function RatingCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-white/35">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${accent}`}>{value}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-white/55">
        {icon}
        <p className="text-xs uppercase tracking-[0.22em]">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

export default async function PublicPlayerPage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  const profile = await getPublicPlayerProfile(identifier);

  if (!profile) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-black px-4 pb-16 pt-28 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
              <Image
                src={profile.memoji}
                alt={profile.displayName}
                width={96}
                height={96}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                Public Player
              </p>
              <h1 className="mt-2 truncate text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {profile.displayName}
              </h1>
              <p className="mt-2 text-sm text-white/45">
                {formatWalletAddress(profile.walletAddress)}
              </p>
              <p className="mt-3 text-sm text-white/60">
                Joined{" "}
                {new Date(profile.joinedAt).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70">
              Username: {profile.username ?? "not set"}
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <RatingCard label="Bullet" value={profile.ratings.bullet} accent="text-sky-300" />
          <RatingCard label="Blitz" value={profile.ratings.blitz} accent="text-amber-300" />
          <RatingCard label="Rapid" value={profile.ratings.rapid} accent="text-emerald-300" />
          <RatingCard label="Staked" value={profile.ratings.staked} accent="text-violet-300" />
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard icon={<Target className="h-4 w-4" />} label="Games" value={profile.totalGames} />
          <StatCard icon={<Trophy className="h-4 w-4 text-emerald-300" />} label="Wins" value={profile.wins} />
          <StatCard icon={<Minus className="h-4 w-4 text-rose-300" />} label="Losses" value={profile.losses} />
          <StatCard icon={<TrendingUp className="h-4 w-4 text-yellow-400" />} label="Win Rate" value={`${profile.winRate}%`} />
          <StatCard icon={<Trophy className="h-4 w-4 text-violet-300" />} label="Total Staked" value={formatStakeAmount(profile.totalStakedAmount) ?? "0 USD"} />
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
                Recent Games
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Latest public results
              </h2>
            </div>
            <Link
              href="/watch"
              className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/12"
            >
              Watch live games
            </Link>
          </div>

          {profile.recentGames.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-white/55">
              No public finished games yet.
            </div>
          ) : (
            <div className="mt-6 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
              {profile.recentGames.map((game) => {
                const opponentLabel = getDisplayName(
                  game.opponentUsername,
                  game.opponentAddress,
                  "Opponent",
                );

                return (
                  <div key={game.id} className="grid gap-3 bg-black/10 px-4 py-4 sm:grid-cols-[110px_minmax(0,1fr)_110px_110px] sm:items-center">
                    <div className="text-sm font-semibold">
                      <span
                        className={
                          game.result === "win"
                            ? "text-emerald-300"
                            : game.result === "loss"
                              ? "text-rose-300"
                              : "text-amber-200"
                        }
                      >
                        {game.result.toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{opponentLabel}</p>
                      <p className="truncate text-xs text-white/45">
                        {formatWalletAddress(game.opponentAddress)} · {game.playedAs}
                      </p>
                    </div>
                    <div className="text-sm text-white/70">
                      {getTimeControlDisplay(game.timeControl)}
                      {game.isStaked
                        ? ` · staked${game.wagerAmount != null ? ` · ${formatStakeAmount(game.wagerAmount)}` : ""}`
                        : ""}
                    </div>
                    <div className="text-sm text-white/50 sm:text-right">
                      {new Date(game.date).toLocaleDateString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
