"use client";

import type { ArenaStanding } from "@/types/arena";
import { motion } from "framer-motion";

interface ArenaLeaderboardProps {
  standings: ArenaStanding[];
  currentUserAddress?: string;
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ArenaLeaderboard({ standings, currentUserAddress }: ArenaLeaderboardProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5">
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="font-semibold text-white">Leaderboard</h2>
      </div>
      <div className="max-h-[600px] overflow-y-auto elegant-scrollbar">
        <table className="w-full">
          <thead className="sticky top-0 bg-white/5 text-xs text-white/40">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Rank</th>
              <th className="px-4 py-2 text-left font-medium">Player</th>
              <th className="px-4 py-2 text-center font-medium">Pts</th>
              <th className="px-4 py-2 text-center font-medium">Games</th>
              <th className="px-4 py-2 text-center font-medium">W/D/L</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((standing, index) => {
              const isCurrentUser =
                currentUserAddress &&
                standing.walletAddress.toLowerCase() === currentUserAddress.toLowerCase();

              const rankColor =
                standing.rank === 1
                  ? "text-amber-400"
                  : standing.rank === 2
                  ? "text-gray-300"
                  : standing.rank === 3
                  ? "text-orange-400"
                  : "text-white/60";

              const rowBg = isCurrentUser
                ? "bg-blue-500/10"
                : index % 2 === 0
                ? "bg-white/[0.02]"
                : "bg-transparent";

              return (
                <motion.tr
                  key={standing.userId}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className={`border-t border-white/5 transition-colors hover:bg-white/5 ${rowBg}`}
                >
                  <td className="px-4 py-3">
                    <div
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                        standing.rank === 1
                          ? "bg-amber-500/20"
                          : standing.rank === 2
                          ? "bg-gray-400/20"
                          : standing.rank === 3
                          ? "bg-orange-700/20"
                          : "bg-white/10"
                      } ${rankColor}`}
                    >
                      {standing.rank}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white">
                        {formatAddress(standing.walletAddress)}
                      </span>
                      {isCurrentUser && (
                        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
                          You
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-semibold text-white">{standing.points}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-white/60">
                    {standing.gamesPlayed}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-white/40">
                    {standing.wins}/{standing.draws}/{standing.losses}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        {standings.length === 0 && (
          <div className="py-12 text-center text-sm text-white/30">
            No players yet
          </div>
        )}
      </div>
    </div>
  );
}
