import {
  getTimeControlOption,
  type TimeControlCategory,
} from "./time-control";

type RatingCarrier = {
  rating?: number | null;
  bulletRating?: number | null;
  blitzRating?: number | null;
  rapidRating?: number | null;
};

export type RatingField = "bulletRating" | "blitzRating" | "rapidRating";

export function getRatingCategoryForTimeControl(
  minutes?: number | string | null,
): TimeControlCategory {
  return getTimeControlOption(minutes).category;
}

export function getRatingFieldForTimeControl(
  minutes?: number | string | null,
): RatingField {
  const category = getRatingCategoryForTimeControl(minutes);

  switch (category) {
    case "Bullet":
      return "bulletRating";
    case "Rapid":
      return "rapidRating";
    case "Blitz":
    default:
      return "blitzRating";
  }
}

export function getPlayerRatingForTimeControl(
  player: RatingCarrier | null | undefined,
  minutes?: number | string | null,
): number {
  if (!player) return 1200;

  const ratingField = getRatingFieldForTimeControl(minutes);
  const rating = player[ratingField];

  if (typeof rating === "number" && Number.isFinite(rating)) {
    return rating;
  }

  return typeof player.rating === "number" && Number.isFinite(player.rating)
    ? player.rating
    : 1200;
}

export function getAllRatings(player: RatingCarrier | null | undefined) {
  return {
    bullet: getPlayerRatingForTimeControl(player, 1),
    blitz: getPlayerRatingForTimeControl(player, 3),
    rapid: getPlayerRatingForTimeControl(player, 10),
  };
}
