type PlayerRatingBadgeProps = {
  rating?: number | null;
};

export function PlayerRatingBadge({ rating }: PlayerRatingBadgeProps) {
  if (typeof rating !== "number" || Number.isNaN(rating)) return null;

  return (
    <span className="shrink-0 rounded-md border border-white/10 bg-white/5 px-1 py-0 text-[9px] font-semibold leading-5 tabular-nums text-white/55 sm:px-1.5 sm:py-0.5 sm:text-[11px] sm:leading-none">
      {rating.toLocaleString()}
    </span>
  );
}
