ALTER TABLE "User"
ADD COLUMN "stakedRating" INTEGER NOT NULL DEFAULT 1200;

UPDATE "User"
SET "stakedRating" = ROUND(("bulletRating" + "blitzRating") / 2.0);
