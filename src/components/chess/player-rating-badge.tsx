type PlayerRatingBadgeProps = {
  rating?: number | null;
};

export function PlayerRatingBadge({ rating }: PlayerRatingBadgeProps) {
  if (typeof rating !== "number" || Number.isNaN(rating)) return null;

  return (
    <span className="shrink-0 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/55 sm:text-[11px]">
      {rating.toLocaleString()}
    </span>
  );
}
