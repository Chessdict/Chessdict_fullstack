ALTER TABLE "OpenChallenge"
ADD COLUMN "staked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stakeToken" TEXT,
ADD COLUMN "stakeAmount" TEXT;
