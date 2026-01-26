"use client";

const gameModes = [
  {
    id: "online",
    title: "Play online",
    description: "Match with players around the world",
  },
  {
    id: "friend",
    title: "Play a friend",
    description: "Challenge someone you know",
  },
  {
    id: "tournament",
    title: "Tournament",
    description: "Join competitive tournaments",
  },
] as const;

export function GameOptions() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <h2 className="text-xl font-semibold text-white">Game Options</h2>

      <div className="flex flex-col gap-3">
        {gameModes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className="group relative flex h-[60px] w-full items-center justify-between rounded-full border border-white/15 bg-white/5 px-6 text-left backdrop-blur-sm transition hover:border-white/30 hover:bg-white/10"
          >
            <span className="absolute inset-0 rounded-full bg-gradient-to-b from-white/10 via-transparent to-transparent opacity-60" />
            <div className="relative z-10 flex flex-1 items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-white">{mode.title}</span>
                <span className="text-xs text-white/60">{mode.description}</span>
              </div>
              <button
                type="button"
                className="ml-4 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-white/5 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  // TODO: Show info modal
                }}
                aria-label={`Info about ${mode.title}`}
              >
                i
              </button>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

