import Link from "next/link";
import { PublicGameSpectator } from "@/components/game/public-game-spectator";
import { getPublicGameSnapshot } from "@/lib/server/public-game";

export const dynamic = "force-dynamic";

export default async function WatchGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const game = await getPublicGameSnapshot(id);

  if (!game) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Spectator View
          </p>
          <h1 className="mt-3 text-2xl font-semibold">Game unavailable</h1>
          <p className="mt-3 text-sm text-white/55">
            This game is not available for public viewing right now.
          </p>
          <Link
            href="/play"
            className="mt-6 inline-flex rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/12"
          >
            Go To Play
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-white/5 via-black to-black" />
      <div className="relative">
        <PublicGameSpectator initialGame={game} />
      </div>
    </main>
  );
}
