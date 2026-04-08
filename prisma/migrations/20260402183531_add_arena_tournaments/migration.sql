-- CreateEnum
CREATE TYPE "TournamentType" AS ENUM ('ROUND_ROBIN', 'ARENA');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "actualStartTime" TIMESTAMP(3),
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "endTime" TIMESTAMP(3),
ADD COLUMN     "maxRating" INTEGER,
ADD COLUMN     "minRating" INTEGER,
ADD COLUMN     "tournamentType" "TournamentType" NOT NULL DEFAULT 'ROUND_ROBIN';

-- AlterTable
ALTER TABLE "TournamentParticipant" ADD COLUMN     "blackGames" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "buchholzScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastOpponentIds" TEXT,
ADD COLUMN     "whiteGames" INTEGER NOT NULL DEFAULT 0;
