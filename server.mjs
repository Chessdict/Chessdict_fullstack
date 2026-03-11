import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const prisma = new PrismaClient();

// ELO rating calculation
const K_FACTOR = 32; // Standard K-factor for chess ratings

function calculateElo(winnerRating, loserRating, isDraw = false) {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;

  if (isDraw) {
    const newRatingA = Math.round(winnerRating + K_FACTOR * (0.5 - expectedWinner));
    const newRatingB = Math.round(loserRating + K_FACTOR * (0.5 - expectedLoser));
    return { newRatingA, newRatingB };
  }

  const newWinnerRating = Math.round(winnerRating + K_FACTOR * (1 - expectedWinner));
  const newLoserRating = Math.round(loserRating + K_FACTOR * (0 - expectedLoser));
  return {
    newWinnerRating,
    newLoserRating: Math.max(100, newLoserRating), // Floor at 100
  };
}

async function updateRatings(game, isDraw = false) {
  const whitePlayer = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
  const blackPlayer = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });
  if (!whitePlayer || !blackPlayer) return null;

  if (isDraw) {
    const { newRatingA, newRatingB } = calculateElo(whitePlayer.rating, blackPlayer.rating, true);
    await prisma.user.update({ where: { id: whitePlayer.id }, data: { rating: newRatingA } });
    await prisma.user.update({ where: { id: blackPlayer.id }, data: { rating: newRatingB } });
    console.log(`[ELO] Draw: ${whitePlayer.walletAddress} ${whitePlayer.rating} -> ${newRatingA}, ${blackPlayer.walletAddress} ${blackPlayer.rating} -> ${newRatingB}`);
    return { [whitePlayer.walletAddress]: newRatingA, [blackPlayer.walletAddress]: newRatingB };
  }

  const winnerId = game.winnerId;
  const winner = winnerId === whitePlayer.id ? whitePlayer : blackPlayer;
  const loser = winnerId === whitePlayer.id ? blackPlayer : whitePlayer;
  const { newWinnerRating, newLoserRating } = calculateElo(winner.rating, loser.rating);

  await prisma.user.update({ where: { id: winner.id }, data: { rating: newWinnerRating } });
  await prisma.user.update({ where: { id: loser.id }, data: { rating: newLoserRating } });
  console.log(`[ELO] Win: ${winner.walletAddress} ${winner.rating} -> ${newWinnerRating}, Loss: ${loser.walletAddress} ${loser.rating} -> ${newLoserRating}`);
  return { [winner.walletAddress]: newWinnerRating, [loser.walletAddress]: newLoserRating };
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Expose io globally so server actions can emit events
  globalThis.__io = io;

  const userSocketMap = new Map(); // userId -> socketId
  const activeGames = new Map(); // socketId -> roomId
  const matchmakingQueue = [];
  const recentlyCompletedGames = new Set(); // Track games that just ended to prevent false disconnect forfeits

  // ─── Tournament Management ───
  const activeTournaments = new Map(); // tournamentId -> tournament state
  const playerTournamentMap = new Map(); // walletAddress -> tournamentId (tracks which tournament a player is in)

  function normalizeWalletAddress(walletAddress) {
    return String(walletAddress || "").toLowerCase();
  }

  function getSocketIdForWallet(walletAddress) {
    const target = normalizeWalletAddress(walletAddress);
    for (const [connectedWallet, socketId] of userSocketMap.entries()) {
      if (normalizeWalletAddress(connectedWallet) === target) {
        return socketId;
      }
    }
    return undefined;
  }

  function hasConnectedTournamentPlayer(state, walletAddress) {
    const target = normalizeWalletAddress(walletAddress);
    for (const connectedWallet of state.connectedPlayers.values()) {
      if (normalizeWalletAddress(connectedWallet) === target) {
        return true;
      }
    }
    return false;
  }

  function addConnectedTournamentPlayer(state, walletAddress) {
    if (!hasConnectedTournamentPlayer(state, walletAddress)) {
      state.connectedPlayers.add(walletAddress);
    }
  }

  function removeConnectedTournamentPlayer(state, walletAddress) {
    const target = normalizeWalletAddress(walletAddress);
    for (const connectedWallet of state.connectedPlayers.values()) {
      if (normalizeWalletAddress(connectedWallet) === target) {
        state.connectedPlayers.delete(connectedWallet);
      }
    }
  }

  // ─── Periodic stale tournament cleanup (every 60 seconds) ───
  setInterval(async () => {
    const now = Date.now();
    for (const [tournamentId, state] of activeTournaments.entries()) {
      // If no players connected and no activity for 2+ minutes, force-complete
      const inactiveMs = now - (state.lastActivityTime || 0);
      if (state.connectedPlayers.size === 0 && inactiveMs > 2 * 60 * 1000) {
        console.log(`[TOURNAMENT CLEANUP] Tournament ${tournamentId} has no connected players for ${Math.round(inactiveMs / 1000)}s. Force-completing.`);
        try {
          await forceCompleteTournament(tournamentId);
        } catch (e) {
          console.error(`[TOURNAMENT CLEANUP] Error force-completing tournament ${tournamentId}:`, e);
        }
      }
    }
  }, 60000);

  function generateRoundRobinSchedule(playerUserIds) {
    const players = [...playerUserIds];
    const isOdd = players.length % 2 !== 0;
    if (isOdd) players.push(null); // bye placeholder

    const n = players.length;
    const rounds = [];
    const fixed = players[0];
    const rotating = players.slice(1);

    for (let r = 0; r < n - 1; r++) {
      const round = [];
      const current = [fixed, ...rotating];

      for (let i = 0; i < n / 2; i++) {
        const p1 = current[i];
        const p2 = current[n - 1 - i];
        if (p1 !== null && p2 !== null) {
          // Alternate colors each round for fairness
          if (r % 2 === 0) {
            round.push({ whiteId: p1, blackId: p2 });
          } else {
            round.push({ whiteId: p2, blackId: p1 });
          }
        }
      }
      rounds.push(round);
      // Rotate: move last to front
      rotating.unshift(rotating.pop());
    }

    return rounds;
  }

  function getTournamentStandings(state) {
    return [...state.participants]
      .sort((a, b) => b.points - a.points || b.wins - a.wins)
      .map((p, i) => ({
        rank: i + 1,
        walletAddress: p.walletAddress,
        userId: p.userId,
        points: p.points,
        wins: p.wins,
        draws: p.draws,
        losses: p.losses,
      }));
  }

  async function startTournament(tournamentId) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        participants: {
          include: { user: { select: { id: true, walletAddress: true } } },
        },
      },
    });

    if (!tournament || (tournament.status !== "READY" && tournament.status !== "PENDING")) {
      console.log(`[TOURNAMENT] Cannot start tournament ${tournamentId}, status: ${tournament?.status}`);
      return;
    }

    if (tournament.participants.length < 3) {
      console.log(`[TOURNAMENT] Not enough players for tournament ${tournamentId}`);
      return;
    }

    const playerUserIds = tournament.participants.map((p) => p.userId);
    const schedule = generateRoundRobinSchedule(playerUserIds);

    // Create all tournament matches in DB upfront
    for (let r = 0; r < schedule.length; r++) {
      for (let m = 0; m < schedule[r].length; m++) {
        const match = schedule[r][m];
        await prisma.tournamentMatch.create({
          data: {
            tournamentId,
            round: r + 1,
            matchIndex: m,
            whitePlayerId: match.whiteId,
            blackPlayerId: match.blackId,
            status: "PENDING",
          },
        });
      }
    }

    // Update tournament status
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: "IN_PROGRESS", currentRound: 0 },
    });

    // Build in-memory state
    const tournamentState = {
      id: tournamentId,
      participants: tournament.participants.map((p) => ({
        participantDbId: p.id,
        userId: p.userId,
        walletAddress: p.user.walletAddress,
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
      })),
      schedule,
      currentRound: 0,
      totalRounds: schedule.length,
      timeControl: tournament.timeControl,
      roundGames: new Map(), // gameId -> { whiteId, blackId, status }
      roundTimer: null,
      breakTimer: null,
      roundEndTime: null,
      connectedPlayers: new Set(), // walletAddresses of currently connected players
      lastActivityTime: Date.now(), // Track last meaningful activity
    };

    activeTournaments.set(tournamentId, tournamentState);

    // Track all players
    for (const p of tournamentState.participants) {
      playerTournamentMap.set(p.walletAddress, tournamentId);
    }

    // Mark all players with active sockets as connected
    for (const p of tournamentState.participants) {
      if (getSocketIdForWallet(p.walletAddress)) {
        addConnectedTournamentPlayer(tournamentState, p.walletAddress);
      }
    }

    const roomName = `tournament:${tournamentId}`;
    console.log(`[TOURNAMENT] Starting tournament ${tournamentId} with ${tournamentState.participants.length} players, ${tournamentState.totalRounds} rounds`);

    io.to(roomName).emit("tournament:starting", {
      tournamentId,
      totalRounds: tournamentState.totalRounds,
      totalPlayers: tournamentState.participants.length,
      timeControl: tournament.timeControl,
      startsIn: 10,
      standings: getTournamentStandings(tournamentState),
    });

    // Notify all clients that the tournament list changed
    io.emit("tournament:listChanged");

    // Start first round after 10 seconds
    setTimeout(() => startTournamentRound(tournamentId), 10000);
  }

  async function startTournamentRound(tournamentId) {
    const state = activeTournaments.get(tournamentId);
    if (!state) return;

    // If all players have disconnected, force-complete instead of starting a new round
    if (state.connectedPlayers.size === 0) {
      console.log(`[TOURNAMENT] No connected players for tournament ${tournamentId}. Force-completing instead of starting round.`);
      await forceCompleteTournament(tournamentId);
      return;
    }

    state.lastActivityTime = Date.now();
    state.currentRound++;
    const roundIndex = state.currentRound - 1;

    if (roundIndex >= state.schedule.length) {
      await completeTournament(tournamentId);
      return;
    }

    const roundPairings = state.schedule[roundIndex];
    state.roundGames = new Map();
    const roundStartResolutions = [];

    // ─── Refresh connected players from actual socket state ───
    // Clear stale entries and re-check who really has a live socket
    console.log(`[ROUND-START] ── Tournament ${tournamentId} Round ${state.currentRound} ──`);
    console.log(`[ROUND-START] connectedPlayers BEFORE refresh: [${[...state.connectedPlayers].join(', ')}]`);
    console.log(`[ROUND-START] userSocketMap keys: [${[...userSocketMap.keys()].join(', ')}]`);

    // Rebuild connectedPlayers from live socket state
    state.connectedPlayers.clear();
    for (const p of state.participants) {
      const socketId = getSocketIdForWallet(p.walletAddress);
      const socketAlive = socketId ? io.sockets.sockets.has(socketId) : false;
      console.log(`[ROUND-START]   participant ${p.walletAddress} → socketId=${socketId || 'NONE'}, socketAlive=${socketAlive}`);
      if (socketId && socketAlive) {
        addConnectedTournamentPlayer(state, p.walletAddress);
      }
    }
    console.log(`[ROUND-START] connectedPlayers AFTER refresh: [${[...state.connectedPlayers].join(', ')}] (${state.connectedPlayers.size}/${state.participants.length})`);

    // If nobody is connected after refresh, force-complete
    if (state.connectedPlayers.size === 0) {
      console.log(`[ROUND-START] No connected players after refresh. Force-completing.`);
      await forceCompleteTournament(tournamentId);
      return;
    }

    // Update tournament current round in DB
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { currentRound: state.currentRound },
    });

    const roomName = `tournament:${tournamentId}`;

    // Create games for this round
    for (const pairing of roundPairings) {
      const game = await prisma.game.create({
        data: {
          whitePlayerId: pairing.whiteId,
          blackPlayerId: pairing.blackId,
          fen: "start",
          status: "IN_PROGRESS",
        },
      });

      // Update tournament match in DB
      await prisma.tournamentMatch.updateMany({
        where: {
          tournamentId,
          round: state.currentRound,
          whitePlayerId: pairing.whiteId,
          blackPlayerId: pairing.blackId,
        },
        data: { gameId: game.id, status: "IN_PROGRESS" },
      });

      state.roundGames.set(game.id, {
        whiteId: pairing.whiteId,
        blackId: pairing.blackId,
        status: "playing",
      });

      // Get players and pair them via sockets
      const whitePlayer = state.participants.find((p) => p.userId === pairing.whiteId);
      const blackPlayer = state.participants.find((p) => p.userId === pairing.blackId);

      if (whitePlayer && blackPlayer) {
        const whiteSocketId = getSocketIdForWallet(whitePlayer.walletAddress);
        const blackSocketId = getSocketIdForWallet(blackPlayer.walletAddress);
        const whiteConnected = hasConnectedTournamentPlayer(state, whitePlayer.walletAddress);
        const blackConnected = hasConnectedTournamentPlayer(state, blackPlayer.walletAddress);

        console.log(`[ROUND-START] Game ${game.id}: WHITE ${whitePlayer.walletAddress} connected=${whiteConnected} socketId=${whiteSocketId || 'NONE'} | BLACK ${blackPlayer.walletAddress} connected=${blackConnected} socketId=${blackSocketId || 'NONE'}`);

        // Join both sockets to the game room for move relay
        if (whiteSocketId) {
          const ws = io.sockets.sockets.get(whiteSocketId);
          if (ws) ws.join(game.id);
        }
        if (blackSocketId) {
          const bs = io.sockets.sockets.get(blackSocketId);
          if (bs) bs.join(game.id);
        }

        // Notify each player of their game
        if (whiteSocketId) {
          io.to(whiteSocketId).emit("tournament:gameStart", {
            tournamentId,
            gameId: game.id,
            color: "white",
            opponentAddress: blackPlayer.walletAddress,
            round: state.currentRound,
            totalRounds: state.totalRounds,
            timeControl: state.timeControl,
          });
        }
        if (blackSocketId) {
          io.to(blackSocketId).emit("tournament:gameStart", {
            tournamentId,
            gameId: game.id,
            color: "black",
            opponentAddress: whitePlayer.walletAddress,
            round: state.currentRound,
            totalRounds: state.totalRounds,
            timeControl: state.timeControl,
          });
        }

        if (!whiteConnected && !blackConnected) {
          console.log(`[ROUND-START] ⚠ BOTH ABSENT → DRAW for game ${game.id} (white: ${whitePlayer.walletAddress}, black: ${blackPlayer.walletAddress})`);
          roundStartResolutions.push({
            gameId: game.id,
            winner: null,
            isDraw: true,
            reason: "players_not_connected",
            whiteWalletAddress: whitePlayer.walletAddress,
            blackWalletAddress: blackPlayer.walletAddress,
          });
        } else if (!whiteConnected) {
          console.log(`[ROUND-START] ⚠ WHITE ABSENT → BLACK WINS (forfeit) for game ${game.id} (absent: ${whitePlayer.walletAddress})`);
          roundStartResolutions.push({
            gameId: game.id,
            winner: "black",
            isDraw: false,
            reason: "player_not_connected",
            absentWalletAddress: whitePlayer.walletAddress,
          });
        } else if (!blackConnected) {
          console.log(`[ROUND-START] ⚠ BLACK ABSENT → WHITE WINS (forfeit) for game ${game.id} (absent: ${blackPlayer.walletAddress})`);
          roundStartResolutions.push({
            gameId: game.id,
            winner: "white",
            isDraw: false,
            reason: "player_not_connected",
            absentWalletAddress: blackPlayer.walletAddress,
          });
        } else {
          console.log(`[ROUND-START] ✓ Both connected for game ${game.id} — normal play`);
        }
      }
    }

    // Handle byes (odd number of players)
    const playingUserIds = new Set();
    for (const pairing of roundPairings) {
      playingUserIds.add(pairing.whiteId);
      playingUserIds.add(pairing.blackId);
    }

    for (const p of state.participants) {
      if (!playingUserIds.has(p.userId)) {
        const socketId = userSocketMap.get(p.walletAddress);
        if (socketId) {
          io.to(socketId).emit("tournament:bye", {
            tournamentId,
            round: state.currentRound,
            totalRounds: state.totalRounds,
          });
        }
        // Bye = 1 point (win)
        p.points += 1;
        p.wins += 1;
        await prisma.tournamentParticipant.updateMany({
          where: { tournamentId, userId: p.userId },
          data: { points: p.points, wins: p.wins },
        });
      }
    }

    // Set round timing
    const roundDurationMs = state.timeControl * 60 * 1000;
    state.roundEndTime = Date.now() + roundDurationMs;

    // Emit round start
    io.to(roomName).emit("tournament:roundStart", {
      tournamentId,
      round: state.currentRound,
      totalRounds: state.totalRounds,
      roundEndTime: state.roundEndTime,
      standings: getTournamentStandings(state),
    });

    console.log(`[TOURNAMENT] Round ${state.currentRound}/${state.totalRounds} started for tournament ${tournamentId}`);
    console.log(`[ROUND-START] Resolutions to process: ${roundStartResolutions.length} (forfeits/draws)`);

    // Set round timeout to force-end any remaining games
    state.roundTimer = setTimeout(() => forceEndTournamentRound(tournamentId), roundDurationMs);

    for (const resolution of roundStartResolutions) {
      if (resolution.isDraw) {
        console.log(`[ROUND-START] Processing DRAW: game ${resolution.gameId} (white: ${resolution.whiteWalletAddress}, black: ${resolution.blackWalletAddress})`);
      } else {
        console.log(`[ROUND-START] Processing FORFEIT: game ${resolution.gameId}, winner=${resolution.winner}, absent=${resolution.absentWalletAddress}`);
      }
      await handleTournamentGameEnd(
        tournamentId,
        resolution.gameId,
        resolution.winner,
        resolution.isDraw,
        resolution.reason,
      );
      console.log(`[ROUND-START] Resolved game ${resolution.gameId} successfully`);
    }
    console.log(`[ROUND-START] ── Round ${state.currentRound} setup complete ──`);
  }

  async function handleTournamentGameEnd(tournamentId, gameId, winner, isDraw, reason = null) {
    const state = activeTournaments.get(tournamentId);
    if (!state) return;

    state.lastActivityTime = Date.now();

    const gameState = state.roundGames.get(gameId);
    if (!gameState || gameState.status !== "playing") return;

    gameState.status = "completed";

    // Update participant scores
    const white = state.participants.find((p) => p.userId === gameState.whiteId);
    const black = state.participants.find((p) => p.userId === gameState.blackId);

    if (isDraw) {
      if (white) { white.points += 0.5; white.draws += 1; }
      if (black) { black.points += 0.5; black.draws += 1; }
    } else if (winner === "white") {
      if (white) { white.points += 1; white.wins += 1; }
      if (black) { black.losses += 1; }
    } else if (winner === "black") {
      if (black) { black.points += 1; black.wins += 1; }
      if (white) { white.losses += 1; }
    }

    // Update DB - participant stats
    if (white) {
      await prisma.tournamentParticipant.updateMany({
        where: { tournamentId, userId: white.userId },
        data: { points: white.points, wins: white.wins, draws: white.draws, losses: white.losses },
      });
    }
    if (black) {
      await prisma.tournamentParticipant.updateMany({
        where: { tournamentId, userId: black.userId },
        data: { points: black.points, wins: black.wins, draws: black.draws, losses: black.losses },
      });
    }

    // Update tournament match
    let winnerId = null;
    if (winner === "white") winnerId = gameState.whiteId;
    else if (winner === "black") winnerId = gameState.blackId;

    await prisma.tournamentMatch.updateMany({
      where: { tournamentId, gameId },
      data: { status: "COMPLETED", winnerId, isDraw },
    });

    await prisma.game.update({
      where: { id: gameId },
      data: { status: isDraw ? "DRAW" : "COMPLETED", winnerId },
    });

    const roomName = `tournament:${tournamentId}`;
    const gamesCompleted = [...state.roundGames.values()].filter((g) => g.status === "completed").length;
    const totalGames = state.roundGames.size;

    console.log(`[TOURNAMENT] Game ${gameId} ended. Round ${state.currentRound}: ${gamesCompleted}/${totalGames} games complete`);

    // Notify players their tournament game ended
    io.to(gameId).emit("tournament:gameOver", {
      tournamentId,
      gameId,
      winner,
      isDraw,
      reason,
      gamesCompleted,
      totalGames,
      roundEndTime: state.roundEndTime,
    });

    // Emit updated standings to everyone
    io.to(roomName).emit("tournament:standings", {
      standings: getTournamentStandings(state),
      round: state.currentRound,
      gamesCompleted,
      totalGames,
    });

    // Check if all games are done
    if (gamesCompleted >= totalGames) {
      if (state.roundTimer) {
        clearTimeout(state.roundTimer);
        state.roundTimer = null;
      }
      startTournamentBreak(tournamentId);
    }
  }

  function startTournamentBreak(tournamentId) {
    const state = activeTournaments.get(tournamentId);
    if (!state) return;

    const roomName = `tournament:${tournamentId}`;
    const breakDurationMs = 10000; // 10 seconds
    const breakEndTime = Date.now() + breakDurationMs;
    const isLastRound = state.currentRound >= state.totalRounds;

    console.log(`[TOURNAMENT] Round ${state.currentRound} complete. ${isLastRound ? "Final round!" : "10s break before next round."}`);

    io.to(roomName).emit("tournament:roundComplete", {
      tournamentId,
      round: state.currentRound,
      standings: getTournamentStandings(state),
      breakEndTime,
      nextRound: state.currentRound + 1,
      isLastRound,
    });

    if (isLastRound) {
      setTimeout(() => completeTournament(tournamentId), breakDurationMs);
    } else {
      state.breakTimer = setTimeout(() => startTournamentRound(tournamentId), breakDurationMs);
    }
  }

  async function forceEndTournamentRound(tournamentId) {
    const state = activeTournaments.get(tournamentId);
    if (!state) return;

    // If no one is connected, skip the normal flow and force-complete
    if (state.connectedPlayers.size === 0) {
      console.log(`[TOURNAMENT] Force-ending round ${state.currentRound} - no players connected, force-completing tournament ${tournamentId}`);
      await forceCompleteTournament(tournamentId);
      return;
    }

    console.log(`[TOURNAMENT] Force-ending round ${state.currentRound} for tournament ${tournamentId}`);

    for (const [gameId, gameState] of state.roundGames.entries()) {
      if (gameState.status === "playing") {
        // Force end: emit to players, default to draw
        io.to(gameId).emit("tournament:forceEnd", { gameId, reason: "round_timeout" });
        gameState.status = "completed";

        const white = state.participants.find((p) => p.userId === gameState.whiteId);
        const black = state.participants.find((p) => p.userId === gameState.blackId);
        if (white) { white.points += 0.5; white.draws += 1; }
        if (black) { black.points += 0.5; black.draws += 1; }

        // Update DB
        if (white) {
          await prisma.tournamentParticipant.updateMany({
            where: { tournamentId, userId: white.userId },
            data: { points: white.points, wins: white.wins, draws: white.draws, losses: white.losses },
          });
        }
        if (black) {
          await prisma.tournamentParticipant.updateMany({
            where: { tournamentId, userId: black.userId },
            data: { points: black.points, wins: black.wins, draws: black.draws, losses: black.losses },
          });
        }

        await prisma.tournamentMatch.updateMany({
          where: { tournamentId, gameId },
          data: { status: "COMPLETED", isDraw: true },
        });
        await prisma.game.update({
          where: { id: gameId },
          data: { status: "DRAW" },
        });
      }
    }

    // Emit final standings for the round
    const roomName = `tournament:${tournamentId}`;
    io.to(roomName).emit("tournament:standings", {
      standings: getTournamentStandings(state),
      round: state.currentRound,
      gamesCompleted: state.roundGames.size,
      totalGames: state.roundGames.size,
    });

    startTournamentBreak(tournamentId);
  }

  // Forfeit a player's active tournament game when they disconnect
  async function forfeitTournamentGame(tournamentId, walletAddress) {
    const state = activeTournaments.get(tournamentId);
    if (!state) return;

    const player = state.participants.find((p) => p.walletAddress === walletAddress);
    if (!player) return;

    // Find their active game in the current round
    for (const [gameId, gameState] of state.roundGames.entries()) {
      if (gameState.status !== "playing") continue;

      let winner = null;
      if (gameState.whiteId === player.userId) {
        winner = "black";
      } else if (gameState.blackId === player.userId) {
        winner = "white";
      }

      if (winner) {
        console.log(`[TOURNAMENT] Player ${walletAddress} disconnected, forfeiting game ${gameId} in tournament ${tournamentId}`);

        // Notify the opponent
        io.to(gameId).emit("tournament:gameOver", {
          tournamentId,
          gameId,
          winner,
          isDraw: false,
          reason: "opponent_disconnected",
        });

        await handleTournamentGameEnd(tournamentId, gameId, winner, false);
        return; // A player can only be in one game per round
      }
    }
  }

  // Check if all players in a tournament have disconnected
  // Force-complete a tournament when all players have disconnected
  async function forceCompleteTournament(tournamentId) {
    const state = activeTournaments.get(tournamentId);
    if (!state) return;

    console.log(`[TOURNAMENT] All players disconnected from tournament ${tournamentId}. Force-completing.`);

    // Cancel any pending timers
    if (state.roundTimer) { clearTimeout(state.roundTimer); state.roundTimer = null; }
    if (state.breakTimer) { clearTimeout(state.breakTimer); state.breakTimer = null; }

    // Force-end any active games in the current round as draws
    for (const [gameId, gameState] of state.roundGames.entries()) {
      if (gameState.status === "playing") {
        gameState.status = "completed";

        const white = state.participants.find((p) => p.userId === gameState.whiteId);
        const black = state.participants.find((p) => p.userId === gameState.blackId);
        if (white) { white.points += 0.5; white.draws += 1; }
        if (black) { black.points += 0.5; black.draws += 1; }

        if (white) {
          await prisma.tournamentParticipant.updateMany({
            where: { tournamentId, userId: white.userId },
            data: { points: white.points, wins: white.wins, draws: white.draws, losses: white.losses },
          });
        }
        if (black) {
          await prisma.tournamentParticipant.updateMany({
            where: { tournamentId, userId: black.userId },
            data: { points: black.points, wins: black.wins, draws: black.draws, losses: black.losses },
          });
        }

        await prisma.tournamentMatch.updateMany({
          where: { tournamentId, gameId },
          data: { status: "COMPLETED", isDraw: true },
        });
        await prisma.game.update({
          where: { id: gameId },
          data: { status: "DRAW" },
        });
      }
    }

    // Mark all remaining unplayed tournament matches as COMPLETED (draw by default)
    await prisma.tournamentMatch.updateMany({
      where: { tournamentId, status: "PENDING" },
      data: { status: "COMPLETED", isDraw: true },
    });

    // Complete the tournament
    await completeTournament(tournamentId);
  }

  async function completeTournament(tournamentId) {
    const state = activeTournaments.get(tournamentId);
    if (!state) return;

    const standings = getTournamentStandings(state);

    // Update tournament in DB
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: "COMPLETED" },
    });

    // Update participant placements
    for (const standing of standings) {
      await prisma.tournamentParticipant.updateMany({
        where: { tournamentId, userId: standing.userId },
        data: { placement: standing.rank },
      });
    }

    const roomName = `tournament:${tournamentId}`;
    console.log(`[TOURNAMENT] Tournament ${tournamentId} completed! Winner: ${standings[0]?.walletAddress}`);

    io.to(roomName).emit("tournament:complete", {
      tournamentId,
      standings,
      winner: standings[0],
    });

    // Notify all clients that the tournament list changed
    io.emit("tournament:listChanged");

    // Clean up
    for (const p of state.participants) {
      playerTournamentMap.delete(p.walletAddress);
    }
    if (state.roundTimer) clearTimeout(state.roundTimer);
    if (state.breakTimer) clearTimeout(state.breakTimer);
    activeTournaments.delete(tournamentId);
  }

  const checkForMatch = async () => {
    if (matchmakingQueue.length >= 2) {
      const p1 = matchmakingQueue.shift();
      const p2 = matchmakingQueue.shift();

      try {
        const whiteUser = await prisma.user.findUnique({ where: { walletAddress: p1.userId } });
        const blackUser = await prisma.user.findUnique({ where: { walletAddress: p2.userId } });

        if (whiteUser && blackUser) {
          const game = await prisma.game.create({
            data: {
              whitePlayerId: whiteUser.id,
              blackPlayerId: blackUser.id,
              fen: "start",
              status: "IN_PROGRESS",
            },
          });

          const roomId = game.id;

          // Emit match found to both players (include ratings)
          io.to(p1.socketId).emit("matchFound", {
            roomId,
            color: "white",
            opponent: p2.userId,
            playerRating: whiteUser.rating,
            opponentRating: blackUser.rating,
          });
          io.to(p2.socketId).emit("matchFound", {
            roomId,
            color: "black",
            opponent: p1.userId,
            playerRating: blackUser.rating,
            opponentRating: whiteUser.rating,
          });

          // Join rooms
          const s1 = io.sockets.sockets.get(p1.socketId);
          const s2 = io.sockets.sockets.get(p2.socketId);
          if (s1) {
            s1.join(roomId);
            activeGames.set(s1.id, roomId);
          }
          if (s2) {
            s2.join(roomId);
            activeGames.set(s2.id, roomId);
          }

          console.log(`Match found and persisted: ${p1.userId} vs ${p2.userId} in ${roomId}`);
        }
      } catch (error) {
        console.error("Error creating match in DB:", error);
      }
    }
  };

  io.on("connection", (socket) => {
    const userId = socket.handshake.query?.userId;
    console.log("Client connected:", socket.id, "User:", userId);

    if (userId) {
      userSocketMap.set(userId, socket.id);
    }

    socket.on("joinQueue", (data) => {
      const uid = data?.userId || userId;
      if (!uid) return;

      const isAlreadyInQueue = matchmakingQueue.some(p => p.socketId === socket.id);
      if (!isAlreadyInQueue) {
        matchmakingQueue.push({ socketId: socket.id, userId: uid });
        console.log(`Player ${uid} joined queue`);
        checkForMatch();
      }
    });

    socket.on("joinRoom", ({ roomId }) => {
      socket.join(roomId);
      activeGames.set(socket.id, roomId);
      console.log(`Socket ${socket.id} joined room ${roomId}`);
      socket.to(roomId).emit("opponentJoined", { socketId: socket.id });
    });

    socket.on("leaveRoom", ({ roomId }) => {
      socket.leave(roomId);
      console.log(`Socket ${socket.id} left room ${roomId}`);
      socket.to(roomId).emit("opponentLeft", { socketId: socket.id });
    });

    socket.on("movePiece", ({ roomId, move }) => {
      console.log(`Move in ${roomId}:`, move);
      socket.to(roomId).emit("opponentMove", move);
    });

    socket.on("sendChallenge", ({ toUserId, fromUserId }) => {
      const targetSocketId = userSocketMap.get(toUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("challengeReceived", { from: fromUserId });
        console.log(`Challenge sent from ${fromUserId} to ${toUserId}`);
      } else {
        socket.emit("challengeError", { error: "User is offline", toUserId });
      }
    });

    socket.on("declineChallenge", ({ toUserId, fromUserId }) => {
      const targetSocketId = userSocketMap.get(toUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("challengeDeclined", { from: fromUserId });
        console.log(`Challenge declined by ${fromUserId} for ${toUserId}`);
      }
    });

    socket.on("checkStatus", ({ userIds }) => {
      const statusMap = {};
      userIds.forEach(uid => {
        statusMap[uid] = userSocketMap.has(uid) ? "online" : "offline";
      });
      socket.emit("statusUpdate", { statusMap });
    });

    socket.on("ping", ({ timestamp }) => {
      socket.emit("pong", { timestamp });
      // Forward this player's ping to their opponent
      const roomId = activeGames.get(socket.id);
      if (roomId) {
        const rtt = Date.now() - timestamp;
        socket.to(roomId).emit("opponentPing", { ping: rtt });
      }
    });

    socket.on("offerDraw", ({ roomId }) => {
      const roomSockets = io.sockets.adapter.rooms.get(roomId);
      console.log(`[SERVER] Draw offered in room ${roomId} by socket ${socket.id}. Sockets in room:`, roomSockets ? Array.from(roomSockets) : "none");
      // Use socket.to to send to all room members except the sender
      socket.to(roomId).emit("drawOffered");
      // Also broadcast via io.to for reliability (sender will also get it, but they already know)
      if (roomSockets) {
        roomSockets.forEach(sid => {
          if (sid !== socket.id) {
            io.to(sid).emit("drawOffered");
          }
        });
      }
    });

    socket.on("acceptDraw", async ({ roomId }) => {
      console.log(`[SERVER] Draw accepted in room ${roomId} by socket ${socket.id}`);
      try {
        const game = await prisma.game.findUnique({ where: { id: roomId } });
        if (!game || game.status !== "IN_PROGRESS") {
          console.log(`[SERVER] Game ${roomId} not valid for draw`);
          return;
        }

        await prisma.game.update({
          where: { id: roomId },
          data: { status: "COMPLETED", winnerId: null },
        });

        // Update ELO ratings for draw
        const newRatings = await updateRatings(game, true);

        recentlyCompletedGames.add(roomId);
        setTimeout(() => recentlyCompletedGames.delete(roomId), 10000);

        const gameOverPayload = { winner: "draw", reason: "draw", ratings: newRatings };
        io.to(roomId).emit("gameOver", gameOverPayload);

        // Also emit directly to both player sockets for reliability
        const whitePlayer = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
        const blackPlayer = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });
        const whiteSocketId = userSocketMap.get(whitePlayer?.walletAddress);
        const blackSocketId = userSocketMap.get(blackPlayer?.walletAddress);
        if (whiteSocketId) io.to(whiteSocketId).emit("gameOver", gameOverPayload);
        if (blackSocketId) io.to(blackSocketId).emit("gameOver", gameOverPayload);

        console.log(`[SERVER] Game ${roomId} ended in draw by agreement`);
      } catch (error) {
        console.error("Error processing draw acceptance:", error);
      }
    });

    socket.on("declineDraw", ({ roomId }) => {
      console.log(`[SERVER] Draw declined in room ${roomId} by socket ${socket.id}`);
      socket.to(roomId).emit("drawDeclined");
      // Also send directly for reliability
      const roomSockets = io.sockets.adapter.rooms.get(roomId);
      if (roomSockets) {
        roomSockets.forEach(sid => {
          if (sid !== socket.id) {
            io.to(sid).emit("drawDeclined");
          }
        });
      }
    });

    socket.on("resign", async ({ roomId, userId }) => {
      console.log(`[SERVER] Resignation received from ${userId} in room ${roomId}`);
      console.log(`[SERVER] Socket ${socket.id} rooms:`, Array.from(socket.rooms));
      try {
        const game = await prisma.game.findUnique({ where: { id: roomId } });
        console.log(`[SERVER] Game found:`, game ? { id: game.id, status: game.status, whitePlayerId: game.whitePlayerId, blackPlayerId: game.blackPlayerId } : null);
        if (!game) {
          console.error(`Game not found for roomId: ${roomId}`);
          socket.emit("resignError", { error: "Game not found" });
          return;
        }

        if (game.status !== "IN_PROGRESS") {
          console.log(`Game ${roomId} is not in progress, status: ${game.status}`);
          socket.emit("resignError", { error: "Game is not in progress" });
          return;
        }

        // Determine winner
        const whitePlayer = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
        const blackPlayer = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });
        console.log(`[SERVER] Players - White: ${whitePlayer?.walletAddress}, Black: ${blackPlayer?.walletAddress}, Resigning userId: ${userId}`);

        let winnerId = null;
        let winnerColor = null;

        if (whitePlayer?.walletAddress === userId) {
          winnerId = game.blackPlayerId;
          winnerColor = "black";
        } else if (blackPlayer?.walletAddress === userId) {
          winnerId = game.whitePlayerId;
          winnerColor = "white";
        }

        if (!winnerId) {
          console.error(`Could not determine winner for resign. userId: ${userId}, white: ${whitePlayer?.walletAddress}, black: ${blackPlayer?.walletAddress}`);
          socket.emit("resignError", { error: "Could not determine winner" });
          return;
        }

        // Update game in database
        await prisma.game.update({
          where: { id: roomId },
          data: {
            status: "COMPLETED",
            winnerId: winnerId
          }
        });

        // Update ELO ratings
        const updatedGame = { ...game, winnerId };
        const newRatings = await updateRatings(updatedGame);

        console.log(`[SERVER] Game ${roomId} ended by resignation. Winner: ${winnerColor}`);

        // Mark game as recently completed to prevent false disconnect forfeits
        recentlyCompletedGames.add(roomId);
        setTimeout(() => recentlyCompletedGames.delete(roomId), 10000); // Clean up after 10 seconds

        // Emit gameOver to all players in the room
        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        console.log(`[SERVER] Emitting gameOver to room ${roomId}. Sockets in room:`, roomSockets ? Array.from(roomSockets) : "none");

        // Also emit directly to both players via their socket IDs for reliability
        const whiteSocketId = userSocketMap.get(whitePlayer?.walletAddress);
        const blackSocketId = userSocketMap.get(blackPlayer?.walletAddress);
        console.log(`[SERVER] Direct socket IDs - White: ${whiteSocketId}, Black: ${blackSocketId}`);

        const gameOverPayload = { winner: winnerColor, reason: "resignation", ratings: newRatings };

        // Emit to room (backup)
        io.to(roomId).emit("gameOver", gameOverPayload);

        // Also emit directly to both player sockets
        if (whiteSocketId) {
          io.to(whiteSocketId).emit("gameOver", gameOverPayload);
        }
        if (blackSocketId) {
          io.to(blackSocketId).emit("gameOver", gameOverPayload);
        }

        console.log(`[SERVER] gameOver event emitted successfully`);
      } catch (error) {
        console.error("Error processing resignation:", error);
        socket.emit("resignError", { error: "Server error processing resignation" });
      }
    });

    socket.on("gameComplete", async ({ roomId, winner, reason }) => {
      console.log(`[SERVER] Game complete received for room ${roomId}: winner=${winner}, reason=${reason}`);
      try {
        const game = await prisma.game.findUnique({ where: { id: roomId } });
        if (!game) {
          console.error(`[SERVER] Game not found for roomId: ${roomId}`);
          return;
        }

        if (game.status !== "IN_PROGRESS") {
          console.log(`[SERVER] Game ${roomId} is not in progress, status: ${game.status}`);
          return;
        }

        // Determine winner ID
        let winnerId = null;
        if (winner === "white") {
          winnerId = game.whitePlayerId;
        } else if (winner === "black") {
          winnerId = game.blackPlayerId;
        }
        // For draw, winnerId remains null

        // Update game in database
        await prisma.game.update({
          where: { id: roomId },
          data: {
            status: "COMPLETED",
            winnerId: winnerId
          }
        });

        // Update ELO ratings
        const isDraw = winner === "draw" || reason === "stalemate";
        const updatedGame = { ...game, winnerId };
        const newRatings = await updateRatings(updatedGame, isDraw);

        console.log(`[SERVER] Game ${roomId} marked as COMPLETED. Winner: ${winner}, Reason: ${reason}`);

        // Mark game as recently completed to prevent false disconnect forfeits
        recentlyCompletedGames.add(roomId);
        setTimeout(() => recentlyCompletedGames.delete(roomId), 10000); // Clean up after 10 seconds

        // Emit gameOver to both players
        const gameOverPayload = { winner, reason, ratings: newRatings };
        io.to(roomId).emit("gameOver", gameOverPayload);

        // Also emit directly to both player sockets for reliability
        const whitePlayer = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
        const blackPlayer = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });

        const whiteSocketId = userSocketMap.get(whitePlayer?.walletAddress);
        const blackSocketId = userSocketMap.get(blackPlayer?.walletAddress);

        if (whiteSocketId) {
          io.to(whiteSocketId).emit("gameOver", gameOverPayload);
        }
        if (blackSocketId) {
          io.to(blackSocketId).emit("gameOver", gameOverPayload);
        }

        console.log(`[SERVER] gameOver event emitted for game completion`);
      } catch (error) {
        console.error("Error processing game completion:", error);
      }
    });

    socket.on("gameTimeout", async ({ roomId, loser }) => {
      console.log(`[SERVER] Timeout received for room ${roomId}: loser=${loser}`);
      try {
        const game = await prisma.game.findUnique({ where: { id: roomId } });
        if (!game) {
          console.error(`[SERVER] Game not found for roomId: ${roomId}`);
          return;
        }

        if (game.status !== "IN_PROGRESS") {
          console.log(`[SERVER] Game ${roomId} is not in progress, status: ${game.status}`);
          return;
        }

        // Determine winner ID (opposite of loser)
        const winnerId = loser === "white" ? game.blackPlayerId : game.whitePlayerId;
        const winnerColor = loser === "white" ? "black" : "white";

        // Update game in database
        await prisma.game.update({
          where: { id: roomId },
          data: {
            status: "COMPLETED",
            winnerId: winnerId
          }
        });

        // Update ELO ratings
        const updatedGame = { ...game, winnerId };
        const newRatings = await updateRatings(updatedGame);

        console.log(`[SERVER] Game ${roomId} marked as COMPLETED due to timeout. Winner: ${winnerColor}`);

        // Mark game as recently completed to prevent false disconnect forfeits
        recentlyCompletedGames.add(roomId);
        setTimeout(() => recentlyCompletedGames.delete(roomId), 10000); // Clean up after 10 seconds

        // Emit gameOver to both players
        const gameOverPayload = { winner: winnerColor, reason: "timeout", ratings: newRatings };
        io.to(roomId).emit("gameOver", gameOverPayload);

        // Also emit directly to both player sockets for reliability
        const whitePlayer = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
        const blackPlayer = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });

        const whiteSocketId = userSocketMap.get(whitePlayer?.walletAddress);
        const blackSocketId = userSocketMap.get(blackPlayer?.walletAddress);

        if (whiteSocketId) {
          io.to(whiteSocketId).emit("gameOver", gameOverPayload);
        }
        if (blackSocketId) {
          io.to(blackSocketId).emit("gameOver", gameOverPayload);
        }

        console.log(`[SERVER] gameOver event emitted for timeout`);
      } catch (error) {
        console.error("Error processing game timeout:", error);
      }
    });

    socket.on("acceptChallenge", async ({ opponentId, userId: myId }) => {
      const targetSocketId = userSocketMap.get(opponentId);

      if (targetSocketId) {
        try {
          const whiteUser = await prisma.user.findUnique({ where: { walletAddress: opponentId } });
          const blackUser = await prisma.user.findUnique({ where: { walletAddress: myId } });

          if (whiteUser && blackUser) {
            const game = await prisma.game.create({
              data: {
                whitePlayerId: whiteUser.id,
                blackPlayerId: blackUser.id,
                fen: "start",
                status: "IN_PROGRESS",
              },
            });

            const roomId = game.id;
            const s1 = socket;
            const s2 = io.sockets.sockets.get(targetSocketId);

            if (s1 && s2) {
              s1.join(roomId);
              s2.join(roomId);
              activeGames.set(s1.id, roomId);
              activeGames.set(s2.id, roomId);

              io.to(s1.id).emit("matchFound", { roomId, color: "black", opponent: opponentId, playerRating: blackUser.rating, opponentRating: whiteUser.rating });
              io.to(s2.id).emit("matchFound", { roomId, color: "white", opponent: myId, playerRating: whiteUser.rating, opponentRating: blackUser.rating });
              console.log(`Challenge accepted and persisted: ${opponentId} vs ${myId} in ${roomId}`);
            }
          }
        } catch (error) {
          console.error("Error creating challenge game in DB:", error);
        }
      }
    });

    // ─── Tournament Socket Events ───

    socket.on("tournament:register", async ({ tournamentId }) => {
      const uid = userId;
      if (!uid || !tournamentId) return;

      const roomName = `tournament:${tournamentId}`;
      socket.join(roomName);
      console.log(`[TOURNAMENT] Player ${uid} registered for tournament ${tournamentId}`);

      // Track this player as connected
      const state = activeTournaments.get(tournamentId);
      if (state) {
        addConnectedTournamentPlayer(state, uid);
        state.lastActivityTime = Date.now();
      }

      // Send current state if tournament is active
      if (state) {
        socket.emit("tournament:state", {
          tournamentId,
          phase: state.currentRound === 0 ? "lobby" : "playing",
          currentRound: state.currentRound,
          totalRounds: state.totalRounds,
          timeControl: state.timeControl,
          roundEndTime: state.roundEndTime,
          standings: getTournamentStandings(state),
          participants: state.participants.map((p) => ({
            walletAddress: p.walletAddress,
            connected: userSocketMap.has(p.walletAddress),
          })),
        });
      } else {
        // Tournament not started yet, send participant info
        try {
          const tournament = await prisma.tournament.findUnique({
            where: { id: tournamentId },
            include: {
              participants: {
                include: { user: { select: { walletAddress: true } } },
              },
            },
          });
          if (tournament) {
            socket.emit("tournament:state", {
              tournamentId,
              phase: "lobby",
              currentRound: 0,
              totalRounds: 0,
              timeControl: tournament.timeControl,
              roundEndTime: null,
              standings: [],
              participants: tournament.participants.map((p) => ({
                walletAddress: p.user.walletAddress,
                connected: userSocketMap.has(p.user.walletAddress),
              })),
            });

            // Notify others that a player connected
            socket.to(roomName).emit("tournament:playerConnected", {
              walletAddress: uid,
              connectedCount: tournament.participants.filter((p) =>
                userSocketMap.has(p.user.walletAddress)
              ).length,
              totalPlayers: tournament.participants.length,
            });
          }
        } catch (e) {
          console.error("[TOURNAMENT] Error fetching tournament for register:", e);
        }
      }
    });

    socket.on("tournament:start", async ({ tournamentId }) => {
      // Only tournament creator or when all players are connected
      if (!tournamentId) return;
      console.log(`[TOURNAMENT] Start requested for tournament ${tournamentId} by ${userId}`);
      await startTournament(tournamentId);
    });

    socket.on("tournament:move", ({ gameId, move }) => {
      // Relay move to opponent in the game room
      socket.to(gameId).emit("tournament:opponentMove", { gameId, move });
    });

    socket.on("tournament:gameComplete", async ({ tournamentId, gameId, winner, isDraw }) => {
      console.log(`[TOURNAMENT] Game complete: tournament=${tournamentId}, game=${gameId}, winner=${winner}, isDraw=${isDraw}`);
      await handleTournamentGameEnd(tournamentId, gameId, winner, isDraw);
    });

    socket.on("tournament:resign", async ({ tournamentId, gameId }) => {
      const uid = userId;
      if (!uid || !tournamentId || !gameId) return;

      const state = activeTournaments.get(tournamentId);
      if (!state) return;

      const gameState = state.roundGames.get(gameId);
      if (!gameState || gameState.status !== "playing") return;

      // Determine who resigned and who wins
      const white = state.participants.find((p) => p.userId === gameState.whiteId);
      const black = state.participants.find((p) => p.userId === gameState.blackId);

      let winner = null;
      if (white?.walletAddress === uid) {
        winner = "black";
      } else if (black?.walletAddress === uid) {
        winner = "white";
      }

      if (winner) {
        // Notify the opponent
        socket.to(gameId).emit("tournament:gameOver", {
          tournamentId,
          gameId,
          winner,
          isDraw: false,
          reason: "resignation",
        });
        await handleTournamentGameEnd(tournamentId, gameId, winner, false);
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);

      // ─── Tournament disconnect handling ───
      const disconnectingUserId = userId;
      if (disconnectingUserId) {
        const tournamentId = playerTournamentMap.get(disconnectingUserId);
        if (tournamentId) {
          const tState = activeTournaments.get(tournamentId);
          if (tState) {
            removeConnectedTournamentPlayer(tState, disconnectingUserId);
            console.log(`[TOURNAMENT] Player ${disconnectingUserId} disconnected from tournament ${tournamentId}. Connected: ${tState.connectedPlayers.size}/${tState.participants.length}`);

            // Forfeit their active game
            forfeitTournamentGame(tournamentId, disconnectingUserId).catch((e) => {
              console.error(`[TOURNAMENT] Error handling tournament disconnect for ${disconnectingUserId}:`, e);
            });

            // Update lastActivityTime so the periodic cleanup interval can detect stale tournaments
            tState.lastActivityTime = Date.now();

            // Notify remaining players
            const roomName = `tournament:${tournamentId}`;
            socket.to(roomName).emit("tournament:playerDisconnected", {
              walletAddress: disconnectingUserId,
              connectedCount: tState.connectedPlayers.size,
              totalPlayers: tState.participants.length,
            });
          }
        }
      }

      // (Moved userSocketMap cleanup to end to allow forfeit processing)

      // Remove from queue if present
      const index = matchmakingQueue.findIndex(p => p.socketId === socket.id);
      if (index !== -1) {
        matchmakingQueue.splice(index, 1);
      }
      // Remove from socket map
      const activeRoomId = activeGames.get(socket.id);
      if (activeRoomId) {
        console.log(`Socket ${socket.id} disconnected from active room ${activeRoomId}`);

        // Capture user ID synchronously before cleanup
        let disconnectedUserId = null;
        for (const [uid, sid] of userSocketMap.entries()) {
          if (sid === socket.id) {
            disconnectedUserId = uid;
            break;
          }
        }

        // Handle disconnect forfeit - check game status FIRST before emitting
        (async () => {
          try {
            // Skip if this game was recently completed (prevents race condition with gameComplete)
            if (recentlyCompletedGames.has(activeRoomId)) {
              console.log(`[SERVER] Game ${activeRoomId} was recently completed, skipping disconnect forfeit`);
              return;
            }

            const game = await prisma.game.findUnique({ where: { id: activeRoomId } });

            // Only process if game exists and is still IN_PROGRESS
            if (game && game.status === "IN_PROGRESS") {
              console.log(`[SERVER] Game ${activeRoomId} is still in progress, processing disconnect forfeit`);

              // Emit gameOver to room
              io.to(activeRoomId).emit("gameOver", { winner: "opponent", reason: "disconnection" });

              // Also emit directly to all sockets in the room for reliability
              const roomSockets = io.sockets.adapter.rooms.get(activeRoomId);
              if (roomSockets) {
                roomSockets.forEach(socketId => {
                  if (socketId !== socket.id) {
                    io.to(socketId).emit("gameOver", { winner: "opponent", reason: "disconnection" });
                  }
                });
              }

              // Update game in database
              if (disconnectedUserId) {
                const whiteUser = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
                const blackUser = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });

                let winnerId = null;
                if (whiteUser?.walletAddress === disconnectedUserId) winnerId = game.blackPlayerId;
                else if (blackUser?.walletAddress === disconnectedUserId) winnerId = game.whitePlayerId;

                if (winnerId) {
                  await prisma.game.update({
                    where: { id: activeRoomId },
                    data: { status: "COMPLETED", winnerId }
                  });

                  // Update ELO ratings
                  const updatedGame = { ...game, winnerId };
                  const newRatings = await updateRatings(updatedGame);

                  // Re-emit with ratings
                  const gameOverPayload = { winner: "opponent", reason: "disconnection", ratings: newRatings };
                  io.to(activeRoomId).emit("gameOver", gameOverPayload);
                  const roomSockets2 = io.sockets.adapter.rooms.get(activeRoomId);
                  if (roomSockets2) {
                    roomSockets2.forEach(sid => {
                      if (sid !== socket.id) io.to(sid).emit("gameOver", gameOverPayload);
                    });
                  }

                  console.log(`[SERVER] Game ${activeRoomId} marked as COMPLETED due to disconnect`);
                }
              }
            } else {
              console.log(`[SERVER] Game ${activeRoomId} is not in progress (status: ${game?.status}), skipping disconnect forfeit`);
            }
          } catch (e) {
            console.error("Error handling disconnect forfeit:", e);
          }
        })();

        activeGames.delete(socket.id);
      }

      if (userId) {
        userSocketMap.delete(userId);
      } else {
        for (const [uid, sid] of userSocketMap.entries()) {
          if (sid === socket.id) {
            userSocketMap.delete(uid);
            console.log(`User ${uid} removed from map (cleanup)`);
            break;
          }
        }
      }
    });
  });

  httpServer.listen(port, async (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);

    // ─── Startup cleanup: mark stuck IN_PROGRESS tournaments as COMPLETED ───
    try {
      const stuckTournaments = await prisma.tournament.findMany({
        where: { status: "IN_PROGRESS" },
      });
      for (const t of stuckTournaments) {
        console.log(`[STARTUP CLEANUP] Marking stuck tournament ${t.id} as COMPLETED`);
        await prisma.tournament.update({
          where: { id: t.id },
          data: { status: "COMPLETED" },
        });
        // Also mark any pending matches as completed
        await prisma.tournamentMatch.updateMany({
          where: { tournamentId: t.id, status: { in: ["PENDING", "IN_PROGRESS"] } },
          data: { status: "COMPLETED", isDraw: true },
        });
        // Mark any in-progress games from this tournament as draws
        const inProgressMatches = await prisma.tournamentMatch.findMany({
          where: { tournamentId: t.id, gameId: { not: null } },
          select: { gameId: true },
        });
        for (const m of inProgressMatches) {
          if (m.gameId) {
            await prisma.game.updateMany({
              where: { id: m.gameId, status: "IN_PROGRESS" },
              data: { status: "DRAW" },
            });
          }
        }
      }
      if (stuckTournaments.length > 0) {
        console.log(`[STARTUP CLEANUP] Cleaned up ${stuckTournaments.length} stuck tournament(s)`);
      }
    } catch (e) {
      console.error("[STARTUP CLEANUP] Error cleaning up stuck tournaments:", e);
    }
  });
});
