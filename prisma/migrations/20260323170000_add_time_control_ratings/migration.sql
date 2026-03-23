ALTER TABLE "User"
ADD COLUMN "bulletRating" INTEGER NOT NULL DEFAULT 1200,
ADD COLUMN "blitzRating" INTEGER NOT NULL DEFAULT 1200,
ADD COLUMN "rapidRating" INTEGER NOT NULL DEFAULT 1200;

UPDATE "User"
SET
  "bulletRating" = "rating",
  "blitzRating" = "rating",
  "rapidRating" = "rating";

ALTER TABLE "Game"
ADD COLUMN "timeControl" INTEGER NOT NULL DEFAULT 3;
