import Link from "next/link";
import { getPublicLiveGames } from "@/lib/server/public-game";
import { PublicGameSpectator } from "@/components/game/public-game-spectator";

export const dynamic = "force-dynamic";

export default async function WatchIndexPage() {
  const games = await getPublicLiveGames();

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300/70">
            Watch
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Live Games
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Public read-only spectating for every game that is actively in
            progress right now. Finished games clear from this wall
            automatically.
          </p>
        </div>

        {games.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center">
            <p className="text-lg font-semibold text-white">No live games right now</p>
            <p className="mt-2 text-sm text-white/50">
              Start a game from the play page, then share its watch link.
            </p>
            <Link
              href="/play"
              className="mt-6 inline-flex rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/12"
            >
              Go To Play
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-3">
            {games.map((game) => (
              <PublicGameSpectator
                key={game.roomId}
                initialGame={game}
                mode="wall"
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
