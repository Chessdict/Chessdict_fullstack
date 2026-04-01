"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { searchUsers } from "@/app/actions";
import { getMemojiForAddress } from "@/lib/memoji";
import { formatWalletAddress, getDisplayName } from "@/lib/utils";

type SearchResult = {
  id: number;
  walletAddress: string;
  username: string | null;
  rating: number;
};

export function PlayerSearchCard() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      const response = await searchUsers(trimmed);
      if (cancelled) return;
      setResults(
        response.success
          ? (response.users ?? []).flatMap((user) =>
              user.walletAddress
                ? [
                    {
                      id: user.id,
                      walletAddress: user.walletAddress,
                      username: user.username ?? null,
                      rating: user.rating,
                    },
                  ]
                : [],
            )
          : [],
      );
      setLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80">
          <Search className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
            Profile
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">Search a player</h2>
        </div>
      </div>

      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by username or wallet"
        className="mt-5 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-white/20"
      />

      <div className="mt-4 space-y-2">
        {loading ? (
          <p className="text-sm text-white/45">Searching players...</p>
        ) : results.length > 0 ? (
          results.map((user) => {
            const identifier = user.username || user.walletAddress;

            return (
              <Link
                key={user.id}
                href={`/player/${encodeURIComponent(identifier)}`}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-3 transition hover:bg-white/5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
                    <Image
                      src={getMemojiForAddress(user.walletAddress)}
                      alt={getDisplayName(user.username, user.walletAddress, "Player")}
                      width={40}
                      height={40}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {getDisplayName(user.username, user.walletAddress, "Player")}
                    </p>
                    <p className="truncate text-xs text-white/45">
                      {formatWalletAddress(user.walletAddress)}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-medium text-amber-300">
                  {user.rating}
                </span>
              </Link>
            );
          })
        ) : query.trim().length >= 3 ? (
          <p className="text-sm text-white/45">No players found.</p>
        ) : (
          <p className="text-sm text-white/45">Type at least 3 characters to search.</p>
        )}
      </div>
    </section>
  );
}
