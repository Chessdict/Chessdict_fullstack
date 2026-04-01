import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpenText, Globe2, Home, Search, UserRoundPlus, Users, Wifi } from "lucide-react";
import { getChessdictsHubData, type ChessdictsMember } from "@/lib/server/chessdicts";
import { PlayerSearchCard } from "@/components/chessdicts/player-search-card";

export const dynamic = "force-dynamic";

function StatCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-2 text-white/50">
        {icon}
        <p className="text-xs font-semibold uppercase tracking-[0.24em]">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      {detail ? <p className="mt-2 text-sm text-white/45">{detail}</p> : null}
    </div>
  );
}

function MemberList({
  title,
  subtitle,
  members,
}: {
  title: string;
  subtitle: string;
  members: ChessdictsMember[];
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
        {subtitle}
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>

      <div className="mt-5 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
        {members.map((member, index) => {
          const identifier = member.username || member.walletAddress;

          return (
            <Link
              key={member.walletAddress}
              href={`/player/${encodeURIComponent(identifier)}`}
              className="grid gap-3 bg-black/10 px-4 py-4 transition hover:bg-white/[0.04] sm:grid-cols-[64px_minmax(0,1fr)_120px] sm:items-center"
            >
              <div className="flex items-center gap-3">
                <span className="w-5 text-sm font-semibold text-white/45">
                  {index + 1}
                </span>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
                  <Image
                    src={member.memoji}
                    alt={member.displayName}
                    width={44}
                    height={44}
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{member.displayName}</p>
                <p className="truncate text-xs text-white/45">{member.shortWallet}</p>
              </div>
              <div className="text-sm text-white/70 sm:text-right">
                <p className="font-medium text-amber-300">{member.rating}</p>
                <p className="mt-1 text-xs text-white/40">
                  {new Date(member.joinedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function PlaceholderCard({
  icon,
  label,
  title,
  description,
  href,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  description: string;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/75">
        {icon}
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
        {label}
      </p>
      <h3 className="mt-2 text-xl font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/50">{description}</p>
      <p className="mt-4 text-sm font-medium text-white/75">
        {href ? "Open" : "Coming soon"}
      </p>
    </>
  );

  if (!href) {
    return <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">{content}</div>;
  }

  return (
    <Link
      href={href}
      className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:bg-white/[0.05]"
    >
      {content}
    </Link>
  );
}

export default async function ChessdictsPage() {
  const hub = await getChessdictsHubData();

  return (
    <main className="min-h-screen bg-black px-4 pb-16 pt-28 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.12),rgba(255,255,255,0.03),rgba(0,0,0,0.92))] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Chessdicts
          </p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                The Chessdict community hub.
              </h1>
              <p className="mt-4 text-base leading-7 text-white/60 sm:text-lg">
                See who is here, who is climbing, and who just joined. This is the public layer for members, live presence, and player discovery.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/60">
              Built from live socket presence, public player data, and member records.
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="Members"
            value={hub.totalMembers}
            detail="Registered Chessdict members"
          />
          <StatCard
            icon={<Wifi className="h-4 w-4" />}
            label="Online"
            value={hub.totalOnline}
            detail="Wallets with a live socket right now"
          />
          <StatCard
            icon={<UserRoundPlus className="h-4 w-4" />}
            label="Joined 24h"
            value={hub.joinedLast24Hours}
            detail="New members in the last 24 hours"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <MemberList
            title="Top rated players"
            subtitle="Standard rating"
            members={hub.topRatedPlayers}
          />
          <MemberList
            title="Newest members"
            subtitle="Latest joins"
            members={hub.newestMembers}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <PlayerSearchCard />
          <div className="grid gap-6 sm:grid-cols-2">
            <PlaceholderCard
              icon={<BookOpenText className="h-5 w-5" />}
              label="Blog"
              title="Editorial and updates"
              description="Space reserved for creator updates, Chessdict product notes, and community writing."
            />
            <PlaceholderCard
              icon={<Users className="h-5 w-5" />}
              label="Friends"
              title="Friends graph"
              description="Player follows, direct social connections, and easier challenge flow can live here later."
            />
            <PlaceholderCard
              icon={<Search className="h-5 w-5" />}
              label="Profile"
              title="Open your profile"
              description="Jump to your profile, share it, and manage your public identity from one place."
              href="/profile"
            />
            <PlaceholderCard
              icon={<Home className="h-5 w-5" />}
              label="Home"
              title="Homepage hub"
              description="Reserved for future homepage shortcuts, featured creators, and community campaigns."
              href="/"
            />
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/75">
              <Globe2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
                Notes
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">How these numbers work</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Online count is based on the live Redis socket mirror. Top rated players use the current standard rating field. Profile search opens the existing public player pages by username or wallet.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
