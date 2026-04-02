ALTER TABLE "User"
ADD COLUMN "bulletRatingDeviation" DOUBLE PRECISION NOT NULL DEFAULT 350,
ADD COLUMN "blitzRatingDeviation" DOUBLE PRECISION NOT NULL DEFAULT 350,
ADD COLUMN "rapidRatingDeviation" DOUBLE PRECISION NOT NULL DEFAULT 350,
ADD COLUMN "stakedRatingDeviation" DOUBLE PRECISION NOT NULL DEFAULT 350,
ADD COLUMN "bulletRatingLastGameAt" TIMESTAMP(3),
ADD COLUMN "blitzRatingLastGameAt" TIMESTAMP(3),
ADD COLUMN "rapidRatingLastGameAt" TIMESTAMP(3),
ADD COLUMN "stakedRatingLastGameAt" TIMESTAMP(3);

UPDATE "User"
SET
  "bulletRatingDeviation" = 125,
  "blitzRatingDeviation" = 125,
  "rapidRatingDeviation" = 125,
  "stakedRatingDeviation" = 125,
  "bulletRatingLastGameAt" = NOW(),
  "blitzRatingLastGameAt" = NOW(),
  "rapidRatingLastGameAt" = NOW(),
  "stakedRatingLastGameAt" = NOW();
