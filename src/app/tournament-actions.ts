"use server";

import prisma from "@/lib/prisma";
import { containsProfanity } from "@/lib/utils";

// ─── Types ───

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export type TournamentListItem = {
  id: string;
  name: string;
  status: string;
  entryFee: number;
  prizePool: number;
  maxPlayers: number;
  timeControl: number;
  startsAt: string;
  token: string | null;
  isSponsored: boolean;
  sponsoredAmount: number;
  sponsorAddress: string | null;
  createdBy: string;
  playerCount: number;
  winner: string | null;
};

// ─── List tournaments ───

export async function getTournaments(
  filter?: "all" | "upcoming" | "in-progress" | "completed" | "cancelled"
): Promise<ActionResult<TournamentListItem[]>> {
  try {
    const statusMap: Record<string, string | undefined> = {
      all: undefined,
      upcoming: "PENDING",
      "in-progress": "IN_PROGRESS",
      completed: "COMPLETED",
      cancelled: "CANCELLED",
    };

    const prismaStatus = statusMap[filter ?? "all"];

    const tournaments = await prisma.tournament.findMany({
      where: prismaStatus ? { status: prismaStatus as any } : undefined,
      include: {
        creator: { select: { walletAddress: true } },
        _count: { select: { participants: true } },
        participants: {
          where: { placement: 1 },
          include: { user: { select: { walletAddress: true } } },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const data: TournamentListItem[] = tournaments.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      entryFee: t.entryFee,
      prizePool: t.prizePool,
      maxPlayers: t.maxPlayers,
      timeControl: t.timeControl,
      startsAt: t.startsAt.toISOString(),
      token: t.token,
      isSponsored: t.isSponsored,
      sponsoredAmount: t.sponsoredAmount,
      sponsorAddress: t.sponsorAddress,
      createdBy: t.creator.walletAddress,
      playerCount: t._count.participants,
      winner: t.participants.find((p: any) => p.placement === 1)?.user?.walletAddress ?? null,
    }));

    return { success: true, data };
  } catch (error) {
    console.error("Error fetching tournaments:", error);
    return { success: false, error: "Failed to fetch tournaments" };
  }
}

// ─── Get single tournament ───

export type TournamentDetail = TournamentListItem & {
  participants: {
    id: string;
    walletAddress: string;
    seed: number | null;
    eliminated: boolean;
    placement: number | null;
  }[];
  matches: {
    id: string;
    round: number;
    matchIndex: number;
    status: string;
    whitePlayer: string | null;
    blackPlayer: string | null;
    winner: string | null;
  }[];
};

export async function getTournamentById(
  tournamentId: string
): Promise<ActionResult<TournamentDetail>> {
  if (!tournamentId) {
    return { success: false, error: "Tournament ID is required" };
  }

  try {
    const t = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        creator: { select: { walletAddress: true } },
        _count: { select: { participants: true } },
        participants: {
          include: { user: { select: { walletAddress: true } } },
          orderBy: { seed: "asc" },
        },
        matches: {
          include: {
            whitePlayer: { select: { walletAddress: true } },
            blackPlayer: { select: { walletAddress: true } },
            winner: { select: { walletAddress: true } },
          },
          orderBy: [{ round: "asc" }, { matchIndex: "asc" }],
        },
      },
    });

    if (!t) {
      return { success: false, error: "Tournament not found" };
    }

    const data: TournamentDetail = {
      id: t.id,
      name: t.name,
      status: t.status,
      entryFee: t.entryFee,
      prizePool: t.prizePool,
      maxPlayers: t.maxPlayers,
      timeControl: t.timeControl,
      startsAt: t.startsAt.toISOString(),
      token: t.token,
      isSponsored: t.isSponsored,
      sponsoredAmount: t.sponsoredAmount,
      sponsorAddress: t.sponsorAddress,
      createdBy: t.creator.walletAddress,
      playerCount: t._count.participants,
      winner: t.participants.find((p) => p.placement === 1)?.user?.walletAddress ?? null,
      participants: t.participants.map((p) => ({
        id: p.id,
        walletAddress: p.user.walletAddress,
        seed: p.seed,
        eliminated: p.eliminated,
        placement: p.placement,
      })),
      matches: t.matches.map((m) => ({
        id: m.id,
        round: m.round,
        matchIndex: m.matchIndex,
        status: m.status,
        whitePlayer: m.whitePlayer?.walletAddress ?? null,
        blackPlayer: m.blackPlayer?.walletAddress ?? null,
        winner: m.winner?.walletAddress ?? null,
      })),
    };

    return { success: true, data };
  } catch (error) {
    console.error("Error fetching tournament:", error);
    return { success: false, error: "Failed to fetch tournament" };
  }
}

// ─── Create tournament ───

type CreateTournamentInput = {
  walletAddress: string;
  name: string;
  maxPlayers: number;
  timeControl: number;
  entryFee: number;
  token: string;
  isSponsored: boolean;
  sponsoredAmount: number;
  startsAt: string; // ISO date string
  joinAsPlayer: boolean;
};

export async function createTournament(
  input: CreateTournamentInput
): Promise<ActionResult<{ id: string }>> {
  if (!input.walletAddress) {
    return { success: false, error: "Wallet not connected" };
  }

  const user = await prisma.user.findUnique({
    where: { walletAddress: input.walletAddress },
    select: { id: true, walletAddress: true },
  });

  if (!user) {
    return { success: false, error: "User not found. Please connect your wallet first." };
  }

  // Validation
  const name = input.name?.trim();
  if (!name || name.length < 2 || name.length > 40) {
    return { success: false, error: "Name must be 2–40 characters" };
  }

  if (containsProfanity(name)) {
    return { success: false, error: "Tournament name contains inappropriate language" };
  }

  if (input.maxPlayers < 3) {
    return { success: false, error: "Minimum 3 players required" };
  }

  if (input.maxPlayers > 256) {
    return { success: false, error: "Maximum 256 players" };
  }

  if (input.entryFee < 0) {
    return { success: false, error: "Entry fee cannot be negative" };
  }

  const startsAtDate = new Date(input.startsAt);
  if (isNaN(startsAtDate.getTime()) || startsAtDate <= new Date()) {
    return { success: false, error: "Start time must be in the future" };
  }

  if (input.isSponsored && input.sponsoredAmount <= 0) {
    return { success: false, error: "Sponsored amount must be greater than zero" };
  }

  try {
    // FIXME: could get to start time before tournament fills up to max players so prize pool may not reach the calculated amount, need to decide if we want to adjust prize pool dynamically or just keep it as is and let early joiners get better value. For now we'll just keep it as is and show the calculated prize pool on the UI with a note that actual prize pool may be lower if tournament starts before all slots are filled.
    const prizePool = input.entryFee * input.maxPlayers + (input.isSponsored ? input.sponsoredAmount : 0);

    const tournament = await prisma.tournament.create({
      data: {
        name,
        maxPlayers: input.maxPlayers,
        timeControl: input.timeControl,
        entryFee: input.entryFee,
        prizePool,
        token: input.token,
        isSponsored: input.isSponsored,
        sponsoredAmount: input.isSponsored ? input.sponsoredAmount : 0,
        sponsorAddress: input.isSponsored ? user.walletAddress : null,
        startsAt: startsAtDate,
        creatorId: user.id,
        // If creator wants to join as player, add them as first participant
        ...(input.joinAsPlayer
          ? {
              participants: {
                create: { userId: user.id, seed: 1 },
              },
            }
          : {}),
      },
    });

    return { success: true, data: { id: tournament.id } };
  } catch (error) {
    console.error("Error creating tournament:", error);
    return { success: false, error: "Failed to create tournament" };
  }
}

// ─── Join tournament ───

export async function joinTournament(
  tournamentId: string,
  walletAddress: string
): Promise<ActionResult<{ participantId: string }>> {
  if (!walletAddress) {
    return { success: false, error: "Wallet not connected" };
  }

  const user = await prisma.user.findUnique({
    where: { walletAddress },
    select: { id: true },
  });

  if (!user) {
    return { success: false, error: "User not found. Please connect your wallet first." };
  }

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { _count: { select: { participants: true } } },
    });

    if (!tournament) {
      return { success: false, error: "Tournament not found" };
    }

    if (tournament.status !== "PENDING") {
      return { success: false, error: "Tournament is no longer accepting players" };
    }

    if (tournament._count.participants >= tournament.maxPlayers) {
      return { success: false, error: "Tournament is full" };
    }

    // Check if already joined
    const existing = await prisma.tournamentParticipant.findUnique({
      where: {
        tournamentId_userId: {
          tournamentId,
          userId: user.id,
        },
      },
    });

    if (existing) {
      return { success: false, error: "Already joined this tournament" };
    }

    const nextSeed = tournament._count.participants + 1;

    const participant = await prisma.tournamentParticipant.create({
      data: {
        tournamentId,
        userId: user.id,
        seed: nextSeed,
      },
    });

    // If tournament is now full, update status to READY
    if (nextSeed >= tournament.maxPlayers) {
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: "READY" },
      });
    }

    return { success: true, data: { participantId: participant.id } };
  } catch (error) {
    console.error("Error joining tournament:", error);
    return { success: false, error: "Failed to join tournament" };
  }
}

// ─── Exit tournament ───

export async function exitTournament(
  tournamentId: string,
  walletAddress: string
): Promise<ActionResult> {
  if (!walletAddress) {
    return { success: false, error: "Wallet not connected" };
  }

  const user = await prisma.user.findUnique({
    where: { walletAddress },
    select: { id: true },
  });

  if (!user) {
    return { success: false, error: "User not found. Please connect your wallet first." };
  }

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true },
    });

    if (!tournament) {
      return { success: false, error: "Tournament not found" };
    }

    if (tournament.status !== "PENDING" && tournament.status !== "READY") {
      return {
        success: false,
        error: "Cannot exit a tournament that has already started",
      };
    }

    const participant = await prisma.tournamentParticipant.findUnique({
      where: {
        tournamentId_userId: {
          tournamentId,
          userId: user.id,
        },
      },
    });

    if (!participant) {
      return { success: false, error: "You are not in this tournament" };
    }

    await prisma.tournamentParticipant.delete({
      where: { id: participant.id },
    });

    // If tournament was READY but now has fewer players, revert to PENDING
    if (tournament.status === "READY") {
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: "PENDING" },
      });
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Error exiting tournament:", error);
    return { success: false, error: "Failed to exit tournament" };
  }
}

// ─── Check if tournament can be started (used by the start button) ───

export async function canStartTournament(
  tournamentId: string,
  walletAddress: string
): Promise<ActionResult<{ canStart: boolean; reason?: string }>> {
  if (!walletAddress) {
    return { success: false, error: "Wallet not connected" };
  }

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        creator: { select: { walletAddress: true } },
        _count: { select: { participants: true } },
      },
    });

    if (!tournament) {
      return { success: false, error: "Tournament not found" };
    }

    // Only creator can start, and status must be READY or PENDING with >= 3 players
    const isCreator = tournament.creator.walletAddress === walletAddress;
    if (!isCreator) {
      return { success: true, data: { canStart: false, reason: "Only the creator can start" } };
    }

    if (tournament.status === "IN_PROGRESS" || tournament.status === "COMPLETED") {
      return { success: true, data: { canStart: false, reason: "Tournament already started" } };
    }

    if (tournament._count.participants < 3) {
      return { success: true, data: { canStart: false, reason: "Need at least 3 players" } };
    }

    return { success: true, data: { canStart: true } };
  } catch (error) {
    console.error("Error checking tournament start:", error);
    return { success: false, error: "Failed to check tournament" };
  }
}
