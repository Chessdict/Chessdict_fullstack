"use client";

import { useEffect, useState } from "react";

interface ArenaHeaderProps {
  name: string;
  endTime: number; // timestamp in ms
  startsAt: string; // ISO string
  status: string; // tournament status
  playerCount: number;
  prizePool: number;
  token: string | null;
}

export function ArenaHeader({
  name,
  endTime,
  startsAt,
  status,
  playerCount,
  prizePool,
  token,
}: ArenaHeaderProps) {
  const [timeDisplay, setTimeDisplay] = useState("");
  const [label, setLabel] = useState("Time Remaining");

  useEffect(() => {
    const updateTime = () => {
      const now = Date.now();
      const startTime = new Date(startsAt).getTime();

      // Tournament hasn't started yet
      if (status !== "IN_PROGRESS" && now < startTime) {
        const remaining = Math.max(0, startTime - now);
        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);

        if (hours > 0) {
          setTimeDisplay(`${hours}h ${minutes}m ${seconds}s`);
        } else {
          setTimeDisplay(`${minutes}m ${seconds}s`);
        }
        setLabel("Starts in");
      } else {
        // Tournament is in progress - show time remaining
        const remaining = Math.max(0, endTime - now);
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        setTimeDisplay(`${minutes}:${seconds.toString().padStart(2, "0")}`);
        setLabel("Time Remaining");
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [endTime, startsAt, status]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{name}</h1>
          <div className="mt-3 flex flex-wrap gap-4">
            <div>
              <div className="text-xs text-white/40">Players</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {playerCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-white/40">Prize Pool</div>
              <div className="mt-1 text-lg font-semibold text-amber-400">
                {prizePool > 0 ? `${prizePool} ${token ?? "ETH"}` : "Free"}
              </div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-white/40">{label}</div>
          <div className={`mt-1 text-3xl font-bold tabular-nums ${label === "Starts in" ? "text-blue-400" : "text-green-400"}`}>
            {timeDisplay}
          </div>
        </div>
      </div>
    </div>
  );
}
