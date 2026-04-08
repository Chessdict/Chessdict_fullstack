"use client";

import type { ArenaGame } from "@/types/arena";
import { useRouter } from "next/navigation";

interface ArenaGamesGridProps {
  games: ArenaGame[];
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ArenaGamesGrid({ games }: ArenaGamesGridProps) {
  const router = useRouter();

  if (games.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center">
        <div className="text-sm text-white/30">No ongoing games</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5">
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="font-semibold text-white">Ongoing Games ({games.length})</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((game) => (
          <button
            key={game.id}
            onClick={() => router.push(`/watch/${game.id}`)}
            className="group relative overflow-hidden rounded-lg border border-white/10 bg-white/5 p-4 text-left transition-all hover:scale-[1.02] hover:border-white/20 hover:bg-white/10"
          >
            {/* White player */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-white" />
                <span className="text-sm text-white">
                  {formatAddress(game.whitePlayerAddress)}
                </span>
              </div>
              <span className="text-xs text-white/40">{game.whiteRating}</span>
            </div>

            {/* VS divider */}
            <div className="my-2 text-center text-xs font-medium text-white/20">VS</div>

            {/* Black player */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-black ring-1 ring-white/20" />
                <span className="text-sm text-white">
                  {formatAddress(game.blackPlayerAddress)}
                </span>
              </div>
              <span className="text-xs text-white/40">{game.blackRating}</span>
            </div>

            {/* Live indicator */}
            <div className="mt-3 flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
              <span className="text-xs text-green-400">Live</span>
            </div>

            {/* Hover effect */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-green-500/0 via-green-500/5 to-green-500/0 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </div>
  );
}
