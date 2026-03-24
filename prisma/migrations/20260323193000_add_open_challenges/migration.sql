-- CreateEnum
CREATE TYPE "OpenChallengeStatus" AS ENUM ('OPEN', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "OpenChallenge" (
    "id" TEXT NOT NULL,
    "creatorId" INTEGER NOT NULL,
    "acceptedById" INTEGER,
    "timeControl" INTEGER NOT NULL DEFAULT 3,
    "status" "OpenChallengeStatus" NOT NULL DEFAULT 'OPEN',
    "roomId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpenChallenge_roomId_key" ON "OpenChallenge"("roomId");

-- CreateIndex
CREATE INDEX "OpenChallenge_creatorId_status_idx" ON "OpenChallenge"("creatorId", "status");

-- CreateIndex
CREATE INDEX "OpenChallenge_status_expiresAt_idx" ON "OpenChallenge"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "OpenChallenge" ADD CONSTRAINT "OpenChallenge_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenChallenge" ADD CONSTRAINT "OpenChallenge_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
