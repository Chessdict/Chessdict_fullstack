"use client";

type TournamentTypeOption = "round-robin" | "arena";

interface TournamentTypeSelectorProps {
  value: TournamentTypeOption;
  onChange: (type: TournamentTypeOption) => void;
}

export function TournamentTypeSelector({ value, onChange }: TournamentTypeSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-white/80">Tournament Type</label>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange("round-robin")}
          className={`
            rounded-lg border-2 p-4 text-left transition-all
            ${
              value === "round-robin"
                ? "border-green-500 bg-green-500/10"
                : "border-white/10 bg-white/5 hover:border-white/20"
            }
          `}
        >
          <div className="font-semibold text-white">Round-Robin</div>
          <div className="mt-1 text-xs text-white/60">
            Everyone plays everyone once
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChange("arena")}
          className={`
            rounded-lg border-2 p-4 text-left transition-all
            ${
              value === "arena"
                ? "border-green-500 bg-green-500/10"
                : "border-white/10 bg-white/5 hover:border-white/20"
            }
          `}
        >
          <div className="font-semibold text-white">Arena</div>
          <div className="mt-1 text-xs text-white/60">
            Play as many games as possible in time limit
          </div>
        </button>
      </div>
    </div>
  );
}
