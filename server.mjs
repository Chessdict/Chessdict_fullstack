import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { PrismaClient } from "@prisma/client";
import { createMatchmaking } from "./lib/matchmaking.mjs";
import { ethers } from "ethers";
import { setWinnerSingleAbi } from "./lib/chessdict-abi-server.mjs";
import {
  redis,
  redisPub,
  redisSub,
  connectRedis,
  setGameState,
  getGameState,
  deleteGameState,
  setUserSocket,
  getUserSocket,
  deleteUserSocket,
  setUserActiveGame,
  getUserActiveGame,
  deleteUserActiveGame,
  markGameCompleted,
  isGameRecentlyCompleted,
  setGameTimer,
  getGameTimer,
  deleteGameTimer,
} from "./lib/redis.mjs";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = process.env.PORT || 8080;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const prisma = new PrismaClient();

// ─── On-chain settlement (staked games) ───
const CHESSDICT_ADDRESS = "0xaBb21D8466df3753764CA84d51db0ed65e155Da9";
const REDEEMER_PRIVATE_KEY = process.env.REDEEMER_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL || "https://sepolia.base.org";

let chessdictContract = null;
if (REDEEMER_PRIVATE_KEY) {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const redeemerWallet = new ethers.Wallet(REDEEMER_PRIVATE_KEY, provider);
    chessdictContract = new ethers.Contract(CHESSDICT_ADDRESS, setWinnerSingleAbi, redeemerWallet);
    console.log(`[SETTLE] Redeemer wallet initialized: ${redeemerWallet.address}`);
  } catch (e) {
    console.error("[SETTLE] Failed to initialize redeemer wallet:", e.message);
  }
} else {
  console.warn("[SETTLE] REDEEMER_PRIVATE_KEY not set — staked game settlement disabled");
}

/**
 * Fire-and-forget: calls setWinnerSingle on the Chessdict contract.
 * @param {string|number} onChainGameId - The on-chain game ID
 * @param {string} winnerAddress - Winner's wallet address (ignored for draws)
 * @param {boolean} isDraw - Whether the game ended in a draw
 */
async function settleStakedGame(onChainGameId, winnerAddress, isDraw) {
  if (!chessdictContract) {
    console.warn("[SETTLE] No contract instance — skipping settlement");
    return false;
  }
  try {
    const gameIdBn = BigInt(onChainGameId);
    // For draws, the winner address doesn't matter on-chain but we still need a valid address
    const winner = isDraw ? ethers.ZeroAddress : winnerAddress;
    console.log(`[SETTLE] Calling setWinnerSingle(${gameIdBn}, ${winner}, ${isDraw})`);
    const tx = await chessdictContract.setWinnerSingle(gameIdBn, winner, isDraw);
    const receipt = await tx.wait();
    console.log(`[SETTLE] setWinnerSingle confirmed in tx ${receipt.hash}`);
    return true;
  } catch (e) {
    console.error(`[SETTLE] setWinnerSingle failed for game ${onChainGameId}:`, e.message);
    return false;
  }
}

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

function getRatingFieldForTimeControl(timeControl, isStaked = false) {
  if (isStaked) return "stakedRating";

  const numericTimeControl = Number.parseInt(String(timeControl ?? ""), 10);
  const normalizedTimeControl = Number.isFinite(numericTimeControl)
    ? numericTimeControl
    : 3;

  if (normalizedTimeControl <= 2) return "bulletRating";
  if (normalizedTimeControl <= 5) return "blitzRating";
  return "rapidRating";
}

function getPlayerRatingForTimeControl(player, timeControl, isStaked = false) {
  if (!player) return 1200;

  const ratingField = getRatingFieldForTimeControl(timeControl, isStaked);
  const categoryRating = player[ratingField];

  if (typeof categoryRating === "number" && Number.isFinite(categoryRating)) {
    return categoryRating;
  }

  return typeof player.rating === "number" && Number.isFinite(player.rating)
    ? player.rating
    : 1200;
}

function buildRatingUpdate(ratingField, rating) {
  if (ratingField === "blitzRating") {
    return {
      [ratingField]: rating,
      rating,
    };
  }

  return {
    [ratingField]: rating,
  };
}

async function updateRatings(game, isDraw = false) {
  const whitePlayer = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
  const blackPlayer = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });
  if (!whitePlayer || !blackPlayer) return null;
  const isStakedGame = !!game.onChainGameId || !!game.stakeToken || game.wagerAmount != null;
  const ratingField = getRatingFieldForTimeControl(game.timeControl, isStakedGame);
  const whiteRating = getPlayerRatingForTimeControl(whitePlayer, game.timeControl, isStakedGame);
  const blackRating = getPlayerRatingForTimeControl(blackPlayer, game.timeControl, isStakedGame);

  if (isDraw) {
    const { newRatingA, newRatingB } = calculateElo(whiteRating, blackRating, true);
    await prisma.user.update({
      where: { id: whitePlayer.id },
      data: buildRatingUpdate(ratingField, newRatingA),
    });
    await prisma.user.update({
      where: { id: blackPlayer.id },
      data: buildRatingUpdate(ratingField, newRatingB),
    });
    console.log(`[ELO] Draw (${ratingField}): ${whitePlayer.walletAddress} ${whiteRating} -> ${newRatingA}, ${blackPlayer.walletAddress} ${blackRating} -> ${newRatingB}`);
    return { [whitePlayer.walletAddress]: newRatingA, [blackPlayer.walletAddress]: newRatingB };
  }

  const winnerId = game.winnerId;
  const winner = winnerId === whitePlayer.id ? whitePlayer : blackPlayer;
  const loser = winnerId === whitePlayer.id ? blackPlayer : whitePlayer;
  const winnerRating = getPlayerRatingForTimeControl(winner, game.timeControl, isStakedGame);
  const loserRating = getPlayerRatingForTimeControl(loser, game.timeControl, isStakedGame);
  const { newWinnerRating, newLoserRating } = calculateElo(winnerRating, loserRating);

  await prisma.user.update({
    where: { id: winner.id },
    data: buildRatingUpdate(ratingField, newWinnerRating),
  });
  await prisma.user.update({
    where: { id: loser.id },
    data: buildRatingUpdate(ratingField, newLoserRating),
  });
  console.log(`[ELO] Win (${ratingField}): ${winner.walletAddress} ${winnerRating} -> ${newWinnerRating}, Loss: ${loser.walletAddress} ${loserRating} -> ${newLoserRating}`);
  return { [winner.walletAddress]: newWinnerRating, [loser.walletAddress]: newLoserRating };
}

app.prepare().then(async () => {
  console.log("[STARTUP] app.prepare() done");
  console.log("[STARTUP] REDIS_URL set:", !!process.env.REDIS_URL);
  console.log("[STARTUP] Connecting Redis...");
  let redisStatus = { mainReady: false, adapterReady: false };
  try {
    redisStatus = await connectRedis();
    console.log("[STARTUP] Redis startup complete");
  } catch (err) {
    console.error("[REDIS] Failed to connect — running without Redis:", err.message);
  }
  console.log("[STARTUP] Creating HTTP server...");

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

  // Attach Redis adapter for multi-instance Socket.IO support
  if (redisStatus.adapterReady) {
    try {
      io.adapter(createAdapter(redisPub, redisSub));
      console.log("[SOCKET.IO] Redis adapter attached");
    } catch (err) {
      console.error("[SOCKET.IO] Redis adapter failed — using in-memory:", err.message);
    }
  } else {
    console.warn("[SOCKET.IO] Redis adapter skipped — using in-memory adapter");
  }

  // Expose io globally so server actions can emit events
  globalThis.__io = io;

  const userSocketMap = new Map(); // userId -> socketId
  const activeGames = new Map(); // socketId -> roomId
  const stakeTimeouts = new Map(); // roomId -> timeout handle (post-create staked confirm timeout)
  const stakeCreationTimeouts = new Map(); // roomId -> timeout handle (pre-create staked setup timeout)
  const stakeCreationFailureDelays = new Map(); // roomId -> timeout handle (grace period before notifying joiner)
  const recentlyCompletedGames = new Set(); // Track games that just ended to prevent false disconnect forfeits
  const rematchRequests = new Map(); // roomId -> { requesterWallet, targetWallet, timeoutHandle }
  // ─── Server-Authoritative Game Timers ───
  const DEFAULT_QUEUE_TIME_CONTROL = 3;
  const MAX_STAKED_TIME_CONTROL = 3;
  const SUPPORTED_QUEUE_TIME_CONTROLS = new Set([1, 2, 3, 10]);
  const DEFAULT_GAME_TIME = 600; // 10 minutes in seconds
  const STAKE_CREATE_TIMEOUT_MS = 45000;
  const STAKE_CREATION_FAILURE_GRACE_MS = 8000;
  const STAKE_CONFIRM_TIMEOUT_MS = 45000;
  const REMATCH_REQUEST_TTL_MS = 120000;
  const gameTimers = new Map(); // roomId -> { whiteTime, blackTime, turn, lastMoveTimestamp, timeoutHandle }

  // ─── Reconnection / Disconnect Grace Period (regular games) ───
  const userActiveGames = new Map(); // walletAddress -> { roomId, color, opponentWallet, opponentRating, playerRating }
  const gameDisconnectTimers = new Map(); // walletAddress -> { roomId, timer, deadline }
  const gameStateStore = new Map(); // roomId -> { fen, moves[] }

  function normalizeQueueTimeControl(timeControl) {
    const numericValue = Number.parseInt(String(timeControl ?? ""), 10);
    if (!Number.isFinite(numericValue)) return DEFAULT_QUEUE_TIME_CONTROL;
    return SUPPORTED_QUEUE_TIME_CONTROLS.has(numericValue)
      ? numericValue
      : DEFAULT_QUEUE_TIME_CONTROL;
  }

  function normalizeStakedTimeControl(timeControl) {
    return Math.min(normalizeQueueTimeControl(timeControl), MAX_STAKED_TIME_CONTROL);
  }

  function getTimeControlSeconds(timeControl) {
    return normalizeQueueTimeControl(timeControl) * 60;
  }

  function getActiveGameInitialTimeSeconds(activeGame) {
    if (!activeGame?.timeControl) return DEFAULT_GAME_TIME;
    return getTimeControlSeconds(activeGame.timeControl);
  }

  function getTimerSnapshot(timer) {
    return {
      whiteTime: Math.round(timer.whiteTime),
      blackTime: Math.round(timer.blackTime),
      initialTime: timer.initialTime,
    };
  }

  function clearStakeCreationFailureDelay(roomId) {
    const delay = stakeCreationFailureDelays.get(roomId);
    if (delay) {
      clearTimeout(delay);
      stakeCreationFailureDelays.delete(roomId);
    }
  }

  function clearStakeCreationTimeout(roomId) {
    const timeout = stakeCreationTimeouts.get(roomId);
    if (timeout) {
      clearTimeout(timeout);
      stakeCreationTimeouts.delete(roomId);
    }
  }

  function scheduleStakeCreationTimeout(roomId) {
    clearStakeCreationTimeout(roomId);

    const creationTimeout = setTimeout(async () => {
      stakeCreationTimeouts.delete(roomId);
      try {
        const waitingGame = await prisma.game.findUnique({ where: { id: roomId } });
        if (!waitingGame || waitingGame.status !== "WAITING" || waitingGame.onChainGameId) return;

        await prisma.game.update({ where: { id: roomId }, data: { status: "ABORTED" } });
        io.to(roomId).emit("stakeCreationExpired", { roomId });
        console.log(`[STAKE] ${Math.round(STAKE_CREATE_TIMEOUT_MS / 1000)}s pre-create timeout — room ${roomId} expired before on-chain game creation`);
        cleanupRegularGame(roomId);
      } catch (e) {
        console.error("[STAKE] Pre-create timeout cleanup error:", e);
      }
    }, STAKE_CREATE_TIMEOUT_MS);

    stakeCreationTimeouts.set(roomId, creationTimeout);
  }

  function clearRematchRequest(roomId) {
    const request = rematchRequests.get(roomId);
    if (request?.timeoutHandle) {
      clearTimeout(request.timeoutHandle);
    }
    rematchRequests.delete(roomId);
  }

  function scheduleStakeCreationFailureDelay(roomId, options = {}) {
    const {
      abortGame = false,
      requireNoOnChainGame = true,
      logMessage = `[STAKE] Creator failure grace expired for room ${roomId} — notified joiner`,
    } = options;

    clearStakeCreationFailureDelay(roomId);

    const delay = setTimeout(async () => {
      stakeCreationFailureDelays.delete(roomId);

      try {
        const game = await prisma.game.findUnique({ where: { id: roomId } });
        if (!game || game.status !== "WAITING") return;
        if (requireNoOnChainGame && game.onChainGameId) return;

        const blackPlayer = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });
        if (!blackPlayer) return;

        if (abortGame) {
          await prisma.game.update({ where: { id: roomId }, data: { status: "ABORTED" } });
        }

        const blackSid = getSocketIdForWallet(blackPlayer.walletAddress);
        if (blackSid) {
          io.to(blackSid).emit("stakeCreationFailed", { roomId });
        }

        console.log(logMessage);
        if (abortGame) {
          cleanupRegularGame(roomId);
        }
      } catch (e) {
        console.error("[STAKE] Delayed stakeCreationFailed error:", e);
      }
    }, STAKE_CREATION_FAILURE_GRACE_MS);

    stakeCreationFailureDelays.set(roomId, delay);
  }

  function cleanupRegularGame(roomId) {
    clearStakeCreationTimeout(roomId);
    clearStakeCreationFailureDelay(roomId);
    gameStateStore.delete(roomId);
    deleteGameState(roomId).catch(() => { });
    deleteGameTimer(roomId).catch(() => { });
    for (const [wallet, data] of userActiveGames.entries()) {
      if (data.roomId === roomId) {
        userActiveGames.delete(wallet);
        deleteUserActiveGame(wallet).catch(() => { });
      }
    }
    for (const [wallet, data] of gameDisconnectTimers.entries()) {
      if (data.roomId === roomId) {
        clearTimeout(data.timer);
        gameDisconnectTimers.delete(wallet);
      }
    }
    cleanupGameTimer(roomId);
  }

  async function getGameStakeState(roomId) {
    const game = await prisma.game.findUnique({
      where: { id: roomId },
      select: {
        status: true,
        onChainGameId: true,
        stakeToken: true,
        wagerAmount: true,
      },
    });

    return {
      status: game?.status ?? null,
      onChainGameId: game?.onChainGameId ?? null,
      stakeToken: game?.stakeToken ?? null,
      stakeAmount: game?.wagerAmount != null ? String(game.wagerAmount) : null,
    };
  }

  function buildInitialRegularGameState(timeControl) {
    return {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moves: [],
      chatMessages: [],
      timeControl,
    };
  }

  function trackActiveRegularGame({
    roomId,
    whiteWallet,
    blackWallet,
    whitePlayerRating,
    blackPlayerRating,
    timeControl,
  }) {
    userActiveGames.set(whiteWallet, {
      roomId,
      color: 'white',
      opponentWallet: blackWallet,
      playerRating: whitePlayerRating,
      opponentRating: blackPlayerRating,
      timeControl,
    });
    userActiveGames.set(blackWallet, {
      roomId,
      color: 'black',
      opponentWallet: whiteWallet,
      playerRating: blackPlayerRating,
      opponentRating: whitePlayerRating,
      timeControl,
    });

    const initialState = buildInitialRegularGameState(timeControl);
    gameStateStore.set(roomId, initialState);
    setUserActiveGame(whiteWallet, userActiveGames.get(whiteWallet)).catch(() => { });
    setUserActiveGame(blackWallet, userActiveGames.get(blackWallet)).catch(() => { });
    setGameState(roomId, initialState).catch(() => { });
  }

  async function hydrateActiveGame(walletAddress) {
    const inMemory = userActiveGames.get(walletAddress);
    if (inMemory) return inMemory;

    const persisted = await getUserActiveGame(walletAddress);
    if (persisted) {
      userActiveGames.set(walletAddress, persisted);
      return persisted;
    }

    return null;
  }

  async function getStoredGameState(roomId) {
    const inMemory = gameStateStore.get(roomId);
    if (inMemory) return inMemory;

    const persisted = await getGameState(roomId);
    if (persisted) {
      gameStateStore.set(roomId, persisted);
      return persisted;
    }

    return null;
  }

  function initGameTimer(roomId, timeInSeconds = DEFAULT_GAME_TIME) {
    const existing = gameTimers.get(roomId);
    if (existing?.timeoutHandle) clearTimeout(existing.timeoutHandle);

    const timerState = {
      initialTime: timeInSeconds,
      whiteTime: timeInSeconds,
      blackTime: timeInSeconds,
      turn: 'w',
      lastMoveTimestamp: Date.now(),
      timeoutHandle: null,
    };
    timerState.timeoutHandle = setTimeout(() => handleServerTimeout(roomId), timeInSeconds * 1000);
    gameTimers.set(roomId, timerState);
    console.log(`[TIMER] Initialized for room ${roomId}: ${timeInSeconds}s each`);
  }

  function cleanupGameTimer(roomId) {
    const timer = gameTimers.get(roomId);
    if (timer?.timeoutHandle) clearTimeout(timer.timeoutHandle);
    gameTimers.delete(roomId);
  }

  function handleServerTimeout(roomId) {
    const timer = gameTimers.get(roomId);
    if (!timer) return;

    const loserColor = timer.turn === 'w' ? 'white' : 'black';
    const winnerColor = timer.turn === 'w' ? 'black' : 'white';
    if (timer.turn === 'w') timer.whiteTime = 0; else timer.blackTime = 0;

    console.log(`[TIMER] Server timeout in room ${roomId}: ${loserColor} ran out of time`);

    // Emit timeSync so both clients see 0
    io.to(roomId).emit('timeSync', getTimerSnapshot(timer));

    (async () => {
      try {
        const game = await prisma.game.findUnique({ where: { id: roomId } });
        if (!game || game.status !== 'IN_PROGRESS') return;

        const winnerId = loserColor === 'white' ? game.blackPlayerId : game.whitePlayerId;
        await prisma.game.update({ where: { id: roomId }, data: { status: 'COMPLETED', winnerId } });

        const updatedGame = { ...game, winnerId };
        const newRatings = await updateRatings(updatedGame);

        recentlyCompletedGames.add(roomId);
        markGameCompleted(roomId, 10).catch(() => { });
        setTimeout(() => recentlyCompletedGames.delete(roomId), 10000);

        // Direct emit for reliability
        const whitePlayer = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
        const blackPlayer = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });

        // Settle staked game on-chain before emitting gameOver
        let settlementFailed = false;
        if (game.onChainGameId) {
          const winnerWallet = winnerColor === 'white' ? whitePlayer?.walletAddress : blackPlayer?.walletAddress;
          const settled = await settleStakedGame(game.onChainGameId, winnerWallet, false);
          if (!settled) settlementFailed = true;
        }

        const payload = { winner: winnerColor, reason: 'timeout', ratings: newRatings, ...(settlementFailed && { settlementFailed: true }) };
        io.to(roomId).emit('gameOver', payload);

        const wSid = userSocketMap.get(whitePlayer?.walletAddress);
        const bSid = userSocketMap.get(blackPlayer?.walletAddress);
        if (wSid) io.to(wSid).emit('gameOver', payload);
        if (bSid) io.to(bSid).emit('gameOver', payload);

        console.log(`[TIMER] gameOver emitted for timeout in room ${roomId}`);
      } catch (error) {
        console.error('[TIMER] Error processing server timeout:', error);
      } finally {
        cleanupRegularGame(roomId);
      }
    })();
  }

  function processMoveTiming(roomId) {
    const timer = gameTimers.get(roomId);
    if (!timer) return null;

    const now = Date.now();
    const elapsed = (now - timer.lastMoveTimestamp) / 1000;

    if (timer.turn === 'w') {
      timer.whiteTime = Math.max(0, timer.whiteTime - elapsed);
    } else {
      timer.blackTime = Math.max(0, timer.blackTime - elapsed);
    }

    timer.turn = timer.turn === 'w' ? 'b' : 'w';
    timer.lastMoveTimestamp = now;

    if (timer.timeoutHandle) clearTimeout(timer.timeoutHandle);
    const nextPlayerTime = timer.turn === 'w' ? timer.whiteTime : timer.blackTime;

    if (nextPlayerTime <= 0) {
      handleServerTimeout(roomId);
      return null;
    }

    timer.timeoutHandle = setTimeout(() => handleServerTimeout(roomId), nextPlayerTime * 1000);
    return getTimerSnapshot(timer);
  }

  // ─── Tournament Management ───
  const activeTournaments = new Map(); // tournamentId -> tournament state
  const playerTournamentMap = new Map(); // walletAddress -> tournamentId (tracks which tournament a player is in)

  function normalizeWalletAddress(walletAddress) {
    return String(walletAddress || "").toLowerCase();
  }

  function getSocketIdForWallet(walletAddress) {
    const target = normalizeWalletAddress(walletAddress);
    let matchedSocketId;
    for (const [connectedWallet, socketId] of userSocketMap.entries()) {
      if (normalizeWalletAddress(connectedWallet) === target) {
        matchedSocketId = socketId;
      }
    }
    return matchedSocketId;
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
          include: { user: { select: { id: true, walletAddress: true, rating: true } } },
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
        rating: p.user.rating ?? 1200,
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
      disconnectTimers: new Map(), // walletAddress (lowercase) -> { timer, gameId, deadline }
      startingEndTime: null, // timestamp when the starting countdown ends
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

    tournamentState.startingEndTime = Date.now() + 10000;

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
    setTimeout(() => {
      tournamentState.startingEndTime = null;
      startTournamentRound(tournamentId);
    }, 10000);
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
            playerRating: whitePlayer.rating ?? 1200,
            opponentRating: blackPlayer.rating ?? 1200,
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
            playerRating: blackPlayer.rating ?? 1200,
            opponentRating: whitePlayer.rating ?? 1200,
            round: state.currentRound,
            totalRounds: state.totalRounds,
            timeControl: state.timeControl,
          });
        }

        if (!whiteConnected && !blackConnected) {
          console.log(`[ROUND-START] ⚠ BOTH ABSENT — will start 30s countdown for both players (game ${game.id})`);
          // Defer countdown start until after roundStart event
          state._pendingForfeitCountdowns = state._pendingForfeitCountdowns || [];
          state._pendingForfeitCountdowns.push(whitePlayer.walletAddress);
          state._pendingForfeitCountdowns.push(blackPlayer.walletAddress);
        } else if (!whiteConnected) {
          console.log(`[ROUND-START] ⚠ WHITE ABSENT — will start 30s countdown for ${whitePlayer.walletAddress} (game ${game.id})`);
          state._pendingForfeitCountdowns = state._pendingForfeitCountdowns || [];
          state._pendingForfeitCountdowns.push(whitePlayer.walletAddress);
        } else if (!blackConnected) {
          console.log(`[ROUND-START] ⚠ BLACK ABSENT — will start 30s countdown for ${blackPlayer.walletAddress} (game ${game.id})`);
          state._pendingForfeitCountdowns = state._pendingForfeitCountdowns || [];
          state._pendingForfeitCountdowns.push(blackPlayer.walletAddress);
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

    // Now start any deferred forfeit countdowns AFTER roundStart was emitted
    const pendingCountdowns = state._pendingForfeitCountdowns || [];
    delete state._pendingForfeitCountdowns;
    for (const walletAddr of pendingCountdowns) {
      startForfeitCountdown(tournamentId, walletAddr);
    }

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

    // Calculate round progress FIRST (before DB calls that might fail)
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

    // Check if all games are done — advance BEFORE DB calls
    if (gamesCompleted >= totalGames) {
      if (state.roundTimer) {
        clearTimeout(state.roundTimer);
        state.roundTimer = null;
      }
      startTournamentBreak(tournamentId);
    }

    // Persist to DB (non-blocking for round advancement)
    try {
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
    } catch (e) {
      console.error(`[TOURNAMENT] DB error persisting game ${gameId} result:`, e);
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

  // ── 30-second disconnect grace period helpers ──

  function startForfeitCountdown(tournamentId, walletAddress) {
    const state = activeTournaments.get(tournamentId);
    if (!state) return;

    const key = normalizeWalletAddress(walletAddress);

    // Don't start a second timer if one is already running
    if (state.disconnectTimers.has(key)) return;

    // Find the player's active game in the current round
    let targetGameId = null;
    const player = state.participants.find(
      (p) => normalizeWalletAddress(p.walletAddress) === key,
    );
    if (player) {
      for (const [gameId, gs] of state.roundGames.entries()) {
        if (gs.status === "playing" && (gs.whiteId === player.userId || gs.blackId === player.userId)) {
          targetGameId = gameId;
          break;
        }
      }
    }

    const deadline = Date.now() + 30000;
    const roomName = `tournament:${tournamentId}`;

    console.log(`[TOURNAMENT] Starting 30s forfeit countdown for ${walletAddress} (game=${targetGameId})`);

    io.to(roomName).emit("tournament:forfeitCountdown", {
      walletAddress,
      forfeitDeadline: deadline,
      gameId: targetGameId,
    });

    const timer = setTimeout(async () => {
      state.disconnectTimers.delete(key);
      console.log(`[TOURNAMENT] 30s expired for ${walletAddress} — forfeiting`);
      await forfeitTournamentGame(tournamentId, walletAddress);
    }, 30000);

    state.disconnectTimers.set(key, { timer, gameId: targetGameId, deadline });
  }

  function cancelForfeitCountdown(tournamentId, walletAddress) {
    const state = activeTournaments.get(tournamentId);
    if (!state) return false;

    const key = normalizeWalletAddress(walletAddress);
    const existing = state.disconnectTimers.get(key);
    if (!existing) return false;

    clearTimeout(existing.timer);
    state.disconnectTimers.delete(key);

    const roomName = `tournament:${tournamentId}`;
    console.log(`[TOURNAMENT] Cancelled forfeit countdown for ${walletAddress} (reconnected)`);

    io.to(roomName).emit("tournament:forfeitCancelled", {
      walletAddress,
      gameId: existing.gameId,
    });

    return true;
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
        // Check if the opponent is also disconnected
        const opponentId = winner === "black" ? gameState.blackId : gameState.whiteId;
        const opponent = state.participants.find((p) => p.userId === opponentId);
        const opponentConnected = opponent ? hasConnectedTournamentPlayer(state, opponent.walletAddress) : false;
        const opponentKey = opponent ? normalizeWalletAddress(opponent.walletAddress) : null;
        const opponentAlsoPendingForfeit = opponentKey && state.disconnectTimers.has(opponentKey);

        if (!opponentConnected && opponentAlsoPendingForfeit) {
          // Both players absent — cancel opponent's timer and record a draw
          if (opponentKey) {
            const otherTimer = state.disconnectTimers.get(opponentKey);
            if (otherTimer) {
              clearTimeout(otherTimer.timer);
              state.disconnectTimers.delete(opponentKey);
            }
          }
          console.log(`[TOURNAMENT] Both players absent for game ${gameId} — recording draw (${walletAddress} + ${opponent?.walletAddress})`);

          await handleTournamentGameEnd(tournamentId, gameId, null, true, "both_players_disconnected");
        } else {
          console.log(`[TOURNAMENT] Player ${walletAddress} disconnected, forfeiting game ${gameId} in tournament ${tournamentId}`);

          await handleTournamentGameEnd(tournamentId, gameId, winner, false, "opponent_disconnected");
        }
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
    // Clear any pending disconnect timers
    for (const [, entry] of state.disconnectTimers) {
      clearTimeout(entry.timer);
    }
    state.disconnectTimers.clear();
    activeTournaments.delete(tournamentId);
  }

  // ─── Matchmaking (extracted module) ───
  async function createMatchedGame(p1, p2, stakeInfo) {
    const whiteUser = await prisma.user.findUnique({ where: { walletAddress: p1.userId } });
    const blackUser = await prisma.user.findUnique({ where: { walletAddress: p2.userId } });
    if (!whiteUser || !blackUser) return;

    const isStaked = !!stakeInfo;
    const matchedTimeControl = isStaked
      ? normalizeStakedTimeControl(stakeInfo?.timeControl ?? p1.timeControl ?? p2.timeControl)
      : normalizeQueueTimeControl(stakeInfo?.timeControl ?? p1.timeControl ?? p2.timeControl);
    const gameData = {
      whitePlayerId: whiteUser.id,
      blackPlayerId: blackUser.id,
      fen: "start",
      status: isStaked ? "WAITING" : "IN_PROGRESS",
      timeControl: matchedTimeControl,
    };
    if (isStaked) {
      gameData.stakeToken = stakeInfo.token;
      gameData.wagerAmount = stakeInfo.effectiveAmount ?? (parseFloat(stakeInfo.stakeAmount) || 0);
    }

    const game = await prisma.game.create({ data: gameData });
    const roomId = game.id;

    const matchPayload = {
      roomId,
      timeControl: matchedTimeControl,
      staked: isStaked,
      stakeToken: stakeInfo?.token ?? null,
      stakeAmount: isStaked
        ? (stakeInfo?.effectiveAmount != null ? String(stakeInfo.effectiveAmount) : stakeInfo?.stakeAmount ?? null)
        : stakeInfo?.stakeAmount ?? null,
      effectiveAmount: stakeInfo?.effectiveAmount ?? null,
    };

    const whitePlayerRating = getPlayerRatingForTimeControl(whiteUser, matchedTimeControl, isStaked);
    const blackPlayerRating = getPlayerRatingForTimeControl(blackUser, matchedTimeControl, isStaked);

    // Emit match found to both players (include ratings + staking info)
    io.to(p1.socketId).emit("matchFound", {
      ...matchPayload,
      color: "white",
      opponent: p2.userId,
      playerRating: whitePlayerRating,
      opponentRating: blackPlayerRating,
    });
    io.to(p2.socketId).emit("matchFound", {
      ...matchPayload,
      color: "black",
      opponent: p1.userId,
      playerRating: blackPlayerRating,
      opponentRating: whitePlayerRating,
    });

    // Join rooms
    const s1 = io.sockets.sockets.get(p1.socketId);
    const s2 = io.sockets.sockets.get(p2.socketId);
    if (s1) { s1.join(roomId); activeGames.set(s1.id, roomId); }
    if (s2) { s2.join(roomId); activeGames.set(s2.id, roomId); }

    trackActiveRegularGame({
      roomId,
      whiteWallet: p1.userId,
      blackWallet: p2.userId,
      whitePlayerRating,
      blackPlayerRating,
      timeControl: matchedTimeControl,
    });

    if (!isStaked) {
      // Non-staked: start timer immediately
      initGameTimer(roomId, getTimeControlSeconds(matchedTimeControl));
    } else {
      scheduleStakeCreationTimeout(roomId);
    }

    console.log(`Match found and persisted: ${p1.userId} vs ${p2.userId} in ${roomId} (staked=${isStaked})`);
  }

  const matchmaking = createMatchmaking({ onMatch: createMatchedGame });
  const { isInAnyQueue, removeFromAllQueues } = matchmaking;

  async function createDirectRegularGame({
    whiteWallet,
    blackWallet,
    whiteSocketId,
    blackSocketId,
    timeControl,
    emitEvent = "matchFound",
  }) {
    const whiteSocket = whiteSocketId ? io.sockets.sockets.get(whiteSocketId) : null;
    const blackSocket = blackSocketId ? io.sockets.sockets.get(blackSocketId) : null;
    if (!whiteSocket || !blackSocket) {
      throw new Error("Both players must be connected");
    }

    const whiteUser = await prisma.user.findUnique({ where: { walletAddress: whiteWallet } });
    const blackUser = await prisma.user.findUnique({ where: { walletAddress: blackWallet } });
    if (!whiteUser || !blackUser) {
      throw new Error("Players not found");
    }

    const matchedTimeControl = normalizeQueueTimeControl(timeControl);
    const whitePlayerRating = getPlayerRatingForTimeControl(whiteUser, matchedTimeControl, false);
    const blackPlayerRating = getPlayerRatingForTimeControl(blackUser, matchedTimeControl, false);
    const game = await prisma.game.create({
      data: {
        whitePlayerId: whiteUser.id,
        blackPlayerId: blackUser.id,
        fen: "start",
        status: "IN_PROGRESS",
        timeControl: matchedTimeControl,
      },
    });

    const roomId = game.id;

    whiteSocket.join(roomId);
    blackSocket.join(roomId);
    activeGames.set(whiteSocket.id, roomId);
    activeGames.set(blackSocket.id, roomId);
    removeFromAllQueues(whiteSocket.id);
    removeFromAllQueues(blackSocket.id);

    io.to(whiteSocket.id).emit(emitEvent, {
      roomId,
      color: "white",
      opponent: blackWallet,
      playerRating: whitePlayerRating,
      opponentRating: blackPlayerRating,
      timeControl: matchedTimeControl,
    });
    io.to(blackSocket.id).emit(emitEvent, {
      roomId,
      color: "black",
      opponent: whiteWallet,
      playerRating: blackPlayerRating,
      opponentRating: whitePlayerRating,
      timeControl: matchedTimeControl,
    });

    trackActiveRegularGame({
      roomId,
      whiteWallet,
      blackWallet,
      whitePlayerRating,
      blackPlayerRating,
      timeControl: matchedTimeControl,
    });
    initGameTimer(roomId, getTimeControlSeconds(matchedTimeControl));

    return {
      roomId,
      timeControl: matchedTimeControl,
      whitePlayerRating,
      blackPlayerRating,
    };
  }

  io.on("connection", (socket) => {
    const userId = socket.handshake.query?.userId;
    console.log("Client connected:", socket.id, "User:", userId);

    if (userId) {
      const normalizedUserId = normalizeWalletAddress(userId);
      for (const [connectedWallet, existingSocketId] of userSocketMap.entries()) {
        if (
          normalizeWalletAddress(connectedWallet) === normalizedUserId &&
          existingSocketId !== socket.id &&
          connectedWallet !== userId
        ) {
          userSocketMap.delete(connectedWallet);
        }
      }
      userSocketMap.set(userId, socket.id);
      setUserSocket(userId, socket.id).catch(() => { }); // mirror to Redis

      // ─── Reconnection: cancel disconnect grace period if exists ───
      const disconnectData = gameDisconnectTimers.get(userId);
      if (disconnectData) {
        clearTimeout(disconnectData.timer);
        gameDisconnectTimers.delete(userId);
        console.log(`[RECONNECT] Cancelled disconnect grace timer for ${userId} in game ${disconnectData.roomId}`);
      }

      // ─── Reconnection: rejoin active game (refresh or reconnect) ───
      (async () => {
        const activeGame = await hydrateActiveGame(userId);
        if (!activeGame) return;

        const gs = await getStoredGameState(activeGame.roomId);
        const timer = gameTimers.get(activeGame.roomId);
        const stakeState = await getGameStakeState(activeGame.roomId);
        const initialTime = getActiveGameInitialTimeSeconds(activeGame);
        let whiteTime = initialTime;
        let blackTime = initialTime;

        if (timer) {
          const elapsed = (Date.now() - timer.lastMoveTimestamp) / 1000;
          whiteTime = timer.turn === 'w' ? Math.max(0, timer.whiteTime - elapsed) : timer.whiteTime;
          blackTime = timer.turn === 'b' ? Math.max(0, timer.blackTime - elapsed) : timer.blackTime;
        }

        socket.join(activeGame.roomId);
        activeGames.set(socket.id, activeGame.roomId);
        socket.to(activeGame.roomId).emit("opponentReconnected");

        socket.emit("gameRejoined", {
          status: stakeState.status,
          roomId: activeGame.roomId,
          color: activeGame.color,
          opponentAddress: activeGame.opponentWallet,
          opponentRating: activeGame.opponentRating,
          playerRating: activeGame.playerRating,
          fen: gs?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          moves: gs?.moves || [],
          chatMessages: gs?.chatMessages || [],
          whiteTime: Math.round(whiteTime),
          blackTime: Math.round(blackTime),
          timeControl: activeGame.timeControl ?? DEFAULT_GAME_TIME / 60,
          onChainGameId: stakeState.onChainGameId,
          stakeToken: stakeState.stakeToken,
          stakeAmount: stakeState.stakeAmount,
        });
        console.log(`[RECONNECT] Player ${userId} rejoined active game ${activeGame.roomId}`);
      })().catch((e) => {
        console.error("[RECONNECT] Failed to restore active game:", e);
      });
    }

    socket.on("joinQueue", (data) => {
      const uid = data?.userId || userId;
      if (!uid) return;

      const normalizedData = {
        ...data,
        userId: uid,
        timeControl: data?.staked
          ? normalizeStakedTimeControl(data?.timeControl)
          : normalizeQueueTimeControl(data?.timeControl),
      };
      const joined = matchmaking.joinQueue(socket.id, normalizedData);
      if (joined) {
        console.log(`Player ${uid} joined ${data?.staked ? 'staked' : 'free'} queue`);
      }
    });

    socket.on("leaveQueue", () => {
      removeFromAllQueues(socket.id);
      console.log(`Player ${userId} left queue`);
    });

    // ─── Staked game: Player1 (white) created game on-chain ───
    socket.on("stakeCreated", async ({ roomId, onChainGameId }) => {
      try {
        const game = await prisma.game.findUnique({ where: { id: roomId } });
        if (!game || game.status !== "WAITING") return;

        clearStakeCreationTimeout(roomId);
        clearStakeCreationFailureDelay(roomId);

        // Store the on-chain game ID
        await prisma.game.update({ where: { id: roomId }, data: { onChainGameId: String(onChainGameId) } });

        // Start post-create timeout for Player 2 to confirm
        const timeout = setTimeout(async () => {
          stakeTimeouts.delete(roomId);
          try {
            const g = await prisma.game.findUnique({ where: { id: roomId } });
            if (g && g.status === "WAITING") {
              await prisma.game.update({ where: { id: roomId }, data: { status: "ABORTED" } });
              io.to(roomId).emit("stakeTimeout", { roomId, onChainGameId: g.onChainGameId });
              console.log(`[STAKE] ${Math.round(STAKE_CONFIRM_TIMEOUT_MS / 1000)}s timeout — game ${roomId} aborted (Player 1 must cancel on-chain to reclaim)`);
              cleanupRegularGame(roomId);
            }
          } catch (e) {
            console.error("[STAKE] Timeout cleanup error:", e);
          }
        }, STAKE_CONFIRM_TIMEOUT_MS);
        stakeTimeouts.set(roomId, timeout);

        // Forward onChainGameId to Player 2 (black) via stakeReady
        const blackPlayer = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });
        if (blackPlayer) {
          const blackSid = getSocketIdForWallet(blackPlayer.walletAddress);
          if (blackSid) {
            io.to(blackSid).emit("stakeReady", {
              roomId,
              onChainGameId: String(onChainGameId),
              stakeToken: game.stakeToken,
              stakeAmount: game.wagerAmount ? String(game.wagerAmount) : null,
              timeControl: normalizeQueueTimeControl(game.timeControl ?? DEFAULT_QUEUE_TIME_CONTROL),
            });
          } else {
            console.warn(`[STAKE] Could not find live socket for joiner ${blackPlayer.walletAddress} in room ${roomId}`);
          }
        }

        console.log(`[STAKE] Player1 created on-chain game ${onChainGameId} for room ${roomId}`);
      } catch (e) {
        console.error("[STAKE] stakeCreated error:", e);
      }
    });

    socket.on("stakeCreationFailed", ({ roomId }) => {
      if (!roomId) return;
      scheduleStakeCreationFailureDelay(roomId);
      console.log(`[STAKE] Creator failed to create on-chain game for room ${roomId}; delaying joiner notice for ${STAKE_CREATION_FAILURE_GRACE_MS}ms`);
    });

    // ─── Staked game: Player2 confirmed stake on-chain ───
    socket.on("stakeConfirmed", async ({ roomId }) => {
      try {
        const game = await prisma.game.findUnique({ where: { id: roomId } });
        if (!game || game.status !== "WAITING") return;

        clearStakeCreationTimeout(roomId);
        clearStakeCreationFailureDelay(roomId);

        // Clear the post-create confirm timeout
        const timeout = stakeTimeouts.get(roomId);
        if (timeout) { clearTimeout(timeout); stakeTimeouts.delete(roomId); }

        // Transition WAITING → IN_PROGRESS
        await prisma.game.update({ where: { id: roomId }, data: { status: "IN_PROGRESS" } });
        const whitePlayer = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
        const matchedTimeControl =
          normalizeQueueTimeControl(
            userActiveGames.get(whitePlayer?.walletAddress)?.timeControl ?? DEFAULT_QUEUE_TIME_CONTROL,
          );
        initGameTimer(roomId, getTimeControlSeconds(matchedTimeControl));

        // Notify both players the game is ready (include onChainGameId so clients can store it)
        io.to(roomId).emit("gameReady", {
          roomId,
          onChainGameId: game.onChainGameId,
          timeControl: matchedTimeControl,
        });
        console.log(`[STAKE] Player2 confirmed stake — game ${roomId} is now IN_PROGRESS`);
      } catch (e) {
        console.error("[STAKE] stakeConfirmed error:", e);
      }
    });

    // ─── Staked game: Player2 declined stake ───
    socket.on("stakeDeclined", async ({ roomId }) => {
      try {
        const game = await prisma.game.findUnique({ where: { id: roomId } });
        if (!game || game.status !== "WAITING") return;

        clearStakeCreationTimeout(roomId);
        clearStakeCreationFailureDelay(roomId);

        // Clear the post-create confirm timeout
        const timeout = stakeTimeouts.get(roomId);
        if (timeout) { clearTimeout(timeout); stakeTimeouts.delete(roomId); }

        const whitePlayer = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
        const blackPlayer = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });
        const normalizedUserId = typeof userId === "string" ? userId.toLowerCase() : null;
        const creatorDeclined =
          !!normalizedUserId &&
          !!whitePlayer &&
          whitePlayer.walletAddress.toLowerCase() === normalizedUserId;

        if (creatorDeclined) {
          scheduleStakeCreationFailureDelay(roomId, {
            abortGame: true,
            requireNoOnChainGame: false,
            logMessage: `[STAKE] Creator cancelled staked setup for room ${roomId} — notified joiner after grace period`,
          });
          console.log(`[STAKE] Creator cancelled staked setup for room ${roomId}; delaying joiner notice for ${STAKE_CREATION_FAILURE_GRACE_MS}ms`);
          return;
        }

        // Abort the game
        await prisma.game.update({ where: { id: roomId }, data: { status: "ABORTED" } });

        // Notify Player1 (white) so they can cancel on-chain and reclaim stake
        if (whitePlayer) {
          const whiteSid = getSocketIdForWallet(whitePlayer.walletAddress);
          if (whiteSid) {
            io.to(whiteSid).emit("opponentDeclinedStake", { roomId, onChainGameId: game.onChainGameId });
          }
        }

        console.log(`[STAKE] Player2 declined stake — game ${roomId} aborted (Player 1 must cancel on-chain to reclaim)`);
        cleanupRegularGame(roomId);
      } catch (e) {
        console.error("[STAKE] stakeDeclined error:", e);
      }
    });

    socket.on("joinRoom", ({ roomId }) => {
      socket.join(roomId);
      activeGames.set(socket.id, roomId);
      console.log(`Socket ${socket.id} joined room ${roomId}`);
      socket.to(roomId).emit("opponentJoined", { socketId: socket.id });

      // Send current timer state so late-joining players sync immediately
      const timer = gameTimers.get(roomId);
      if (timer) {
        const now = Date.now();
        const elapsed = (now - timer.lastMoveTimestamp) / 1000;
        const whiteTime = timer.turn === 'w' ? Math.max(0, timer.whiteTime - elapsed) : timer.whiteTime;
        const blackTime = timer.turn === 'b' ? Math.max(0, timer.blackTime - elapsed) : timer.blackTime;
        socket.emit('timeSync', { whiteTime: Math.round(whiteTime), blackTime: Math.round(blackTime), initialTime: timer.initialTime });
      }
    });

    // Explicit rejoin for URL-based game reconnection (/play/game/[id])
    socket.on("rejoinGame", async ({ roomId: requestedRoomId }) => {
      const activeGame = await hydrateActiveGame(userId);
      if (!activeGame || activeGame.roomId !== requestedRoomId) {
        socket.emit("rejoinError", { error: "No active game found for this room" });
        return;
      }

      const gs = await getStoredGameState(activeGame.roomId);
      const timer = gameTimers.get(activeGame.roomId);

      const initialTime = getActiveGameInitialTimeSeconds(activeGame);
      let whiteTime = initialTime, blackTime = initialTime;
      if (timer) {
        const elapsed = (Date.now() - timer.lastMoveTimestamp) / 1000;
        whiteTime = timer.turn === 'w' ? Math.max(0, timer.whiteTime - elapsed) : timer.whiteTime;
        blackTime = timer.turn === 'b' ? Math.max(0, timer.blackTime - elapsed) : timer.blackTime;
      }

      const stakeState = await getGameStakeState(activeGame.roomId);

      socket.join(activeGame.roomId);
      activeGames.set(socket.id, activeGame.roomId);
      socket.to(activeGame.roomId).emit("opponentReconnected");

      socket.emit("gameRejoined", {
        status: stakeState.status,
        roomId: activeGame.roomId,
        color: activeGame.color,
        opponentAddress: activeGame.opponentWallet,
        opponentRating: activeGame.opponentRating,
        playerRating: activeGame.playerRating,
        fen: gs?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: gs?.moves || [],
        chatMessages: gs?.chatMessages || [],
        whiteTime: Math.round(whiteTime),
        blackTime: Math.round(blackTime),
        timeControl: activeGame.timeControl ?? DEFAULT_GAME_TIME / 60,
        onChainGameId: stakeState.onChainGameId,
        stakeToken: stakeState.stakeToken,
        stakeAmount: stakeState.stakeAmount,
      });
      console.log(`[REJOIN] Player ${userId} explicitly rejoined game ${activeGame.roomId}`);
    });

    socket.on("leaveRoom", ({ roomId }) => {
      socket.leave(roomId);
      console.log(`Socket ${socket.id} left room ${roomId}`);
      socket.to(roomId).emit("opponentLeft", { socketId: socket.id });
    });

    socket.on("requestRematch", async ({ roomId }) => {
      if (!userId || !roomId) {
        socket.emit("rematchUnavailable", { roomId, error: "Invalid rematch request" });
        return;
      }

      try {
        const game = await prisma.game.findUnique({
          where: { id: roomId },
          include: {
            whitePlayer: { select: { walletAddress: true } },
            blackPlayer: { select: { walletAddress: true } },
          },
        });

        if (!game || game.status !== "COMPLETED") {
          socket.emit("rematchUnavailable", { roomId, error: "Game is not available for rematch" });
          return;
        }

        if (game.onChainGameId || game.stakeToken || game.wagerAmount != null) {
          socket.emit("rematchUnavailable", { roomId, error: "Staked games must start from the play page" });
          return;
        }

        const normalizedUserId = String(userId).toLowerCase();
        const whiteWallet = game.whitePlayer.walletAddress;
        const blackWallet = game.blackPlayer.walletAddress;
        let opponentWallet = null;

        if (whiteWallet.toLowerCase() === normalizedUserId) {
          opponentWallet = blackWallet;
        } else if (blackWallet.toLowerCase() === normalizedUserId) {
          opponentWallet = whiteWallet;
        } else {
          socket.emit("rematchUnavailable", { roomId, error: "You were not a player in this game" });
          return;
        }

        if (await hydrateActiveGame(String(userId))) {
          socket.emit("rematchUnavailable", { roomId, error: "Finish your current game before requesting a rematch" });
          return;
        }

        if (await hydrateActiveGame(opponentWallet)) {
          socket.emit("rematchUnavailable", { roomId, error: "Opponent is already in another game" });
          return;
        }

        const opponentSocketId = userSocketMap.get(opponentWallet);
        const opponentSocket = opponentSocketId ? io.sockets.sockets.get(opponentSocketId) : null;
        if (!opponentSocket) {
          socket.emit("rematchUnavailable", { roomId, error: "Opponent is no longer online" });
          return;
        }

        const existingRequest = rematchRequests.get(roomId);
        if (existingRequest) {
          if (existingRequest.requesterWallet.toLowerCase() === normalizedUserId) {
            socket.emit("rematchPending", { roomId });
            return;
          }

          if (existingRequest.targetWallet.toLowerCase() === normalizedUserId) {
            clearRematchRequest(roomId);

            await createDirectRegularGame({
              whiteWallet: blackWallet,
              blackWallet: whiteWallet,
              whiteSocketId: userSocketMap.get(blackWallet),
              blackSocketId: userSocketMap.get(whiteWallet),
              timeControl: game.timeControl ?? DEFAULT_QUEUE_TIME_CONTROL,
            });
            return;
          }
        }

        const timeoutHandle = setTimeout(() => {
          const request = rematchRequests.get(roomId);
          if (!request || request.requesterWallet.toLowerCase() !== normalizedUserId) return;
          clearRematchRequest(roomId);

          const requesterSocketId = userSocketMap.get(request.requesterWallet);
          const targetSocketId = userSocketMap.get(request.targetWallet);
          if (requesterSocketId) {
            io.to(requesterSocketId).emit("rematchExpired", { roomId });
          }
          if (targetSocketId) {
            io.to(targetSocketId).emit("rematchExpired", { roomId });
          }
        }, REMATCH_REQUEST_TTL_MS);

        rematchRequests.set(roomId, {
          requesterWallet: String(userId),
          targetWallet: opponentWallet,
          timeoutHandle,
        });

        socket.emit("rematchPending", { roomId });
        io.to(opponentSocket.id).emit("rematchRequested", {
          roomId,
          from: String(userId),
        });
      } catch (error) {
        console.error("[REMATCH] requestRematch error:", error);
        socket.emit("rematchUnavailable", { roomId, error: "Unable to request rematch" });
      }
    });

    socket.on("respondRematch", async ({ roomId, accept }) => {
      if (!userId || !roomId) {
        socket.emit("rematchUnavailable", { roomId, error: "Invalid rematch response" });
        return;
      }

      const existingRequest = rematchRequests.get(roomId);
      if (!existingRequest) {
        socket.emit("rematchUnavailable", { roomId, error: "Rematch request is no longer available" });
        return;
      }

      if (existingRequest.targetWallet.toLowerCase() !== String(userId).toLowerCase()) {
        socket.emit("rematchUnavailable", { roomId, error: "You cannot respond to this rematch request" });
        return;
      }

      clearRematchRequest(roomId);

      const requesterSocketId = userSocketMap.get(existingRequest.requesterWallet);
      if (!accept) {
        if (requesterSocketId) {
          io.to(requesterSocketId).emit("rematchDeclined", { roomId });
        }
        return;
      }

      try {
        const game = await prisma.game.findUnique({
          where: { id: roomId },
          include: {
            whitePlayer: { select: { walletAddress: true } },
            blackPlayer: { select: { walletAddress: true } },
          },
        });

        if (!game || game.status !== "COMPLETED") {
          socket.emit("rematchUnavailable", { roomId, error: "Game is not available for rematch" });
          if (requesterSocketId) {
            io.to(requesterSocketId).emit("rematchUnavailable", { roomId, error: "Game is not available for rematch" });
          }
          return;
        }

        if (game.onChainGameId || game.stakeToken || game.wagerAmount != null) {
          socket.emit("rematchUnavailable", { roomId, error: "Staked games must start from the play page" });
          if (requesterSocketId) {
            io.to(requesterSocketId).emit("rematchUnavailable", { roomId, error: "Staked games must start from the play page" });
          }
          return;
        }

        const whiteWallet = game.whitePlayer.walletAddress;
        const blackWallet = game.blackPlayer.walletAddress;

        if (await hydrateActiveGame(existingRequest.requesterWallet) || await hydrateActiveGame(existingRequest.targetWallet)) {
          const error = "One of the players already entered another game";
          socket.emit("rematchUnavailable", { roomId, error });
          if (requesterSocketId) {
            io.to(requesterSocketId).emit("rematchUnavailable", { roomId, error });
          }
          return;
        }

        const newWhiteSocketId = userSocketMap.get(blackWallet);
        const newBlackSocketId = userSocketMap.get(whiteWallet);
        if (!newWhiteSocketId || !newBlackSocketId) {
          const error = "Both players must still be online";
          socket.emit("rematchUnavailable", { roomId, error });
          if (requesterSocketId) {
            io.to(requesterSocketId).emit("rematchUnavailable", { roomId, error });
          }
          return;
        }

        await createDirectRegularGame({
          whiteWallet: blackWallet,
          blackWallet: whiteWallet,
          whiteSocketId: newWhiteSocketId,
          blackSocketId: newBlackSocketId,
          timeControl: game.timeControl ?? DEFAULT_QUEUE_TIME_CONTROL,
        });
      } catch (error) {
        console.error("[REMATCH] respondRematch error:", error);
        const message = "Unable to start rematch";
        socket.emit("rematchUnavailable", { roomId, error: message });
        if (requesterSocketId) {
          io.to(requesterSocketId).emit("rematchUnavailable", { roomId, error: message });
        }
      }
    });

    socket.on("movePiece", ({ roomId, move, fen, moveRecord }) => {
      console.log(`Move in ${roomId}:`, move);
      socket.to(roomId).emit("opponentMove", move);

      // Store game state for reconnection
      const gs = gameStateStore.get(roomId);
      if (gs) {
        if (fen) gs.fen = fen;
        if (moveRecord) gs.moves.push(moveRecord);
      }

      // Update server-authoritative timer and broadcast synced times
      const times = processMoveTiming(roomId);
      if (times) {
        io.to(roomId).emit("timeSync", times);
      }
    });

    socket.on("sendChallenge", ({ toUserId, fromUserId, stakeEnabled, stakeToken, stakeAmount, timeControl }) => {
      const targetSocketId = userSocketMap.get(toUserId);
      const normalizedTimeControl = stakeEnabled
        ? normalizeStakedTimeControl(timeControl)
        : normalizeQueueTimeControl(timeControl);
      if (targetSocketId) {
        io.to(targetSocketId).emit("challengeReceived", {
          from: fromUserId,
          stakeEnabled: !!stakeEnabled,
          stakeToken: stakeToken ?? null,
          stakeAmount: stakeAmount ?? null,
          timeControl: normalizedTimeControl,
        });
        console.log(`Challenge sent from ${fromUserId} to ${toUserId}`);
      } else {
        socket.emit("challengeError", { error: "User is offline", toUserId });
      }
    });

    // ─── In-Game Chat ───
    socket.on("chatMessage", ({ roomId, message }) => {
      if (!roomId || !message || !userId) return;
      const text = String(message).slice(0, 500);
      const payload = { sender: userId, text, timestamp: Date.now() };
      // Store chat message for reconnection
      const gs = gameStateStore.get(roomId);
      if (gs) {
        if (!gs.chatMessages) gs.chatMessages = [];
        gs.chatMessages.push(payload);
      }
      // Broadcast to others in room only; sender adds message optimistically
      socket.to(roomId).emit("chatMessage", payload);
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
      cleanupRegularGame(roomId);
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
        markGameCompleted(roomId, 10).catch(() => { });
        setTimeout(() => recentlyCompletedGames.delete(roomId), 10000);

        // Also emit directly to both player sockets for reliability
        const whitePlayer = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
        const blackPlayer = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });

        // Settle staked game on-chain before emitting gameOver
        let settlementFailed = false;
        if (game.onChainGameId) {
          const settled = await settleStakedGame(game.onChainGameId, null, true);
          if (!settled) settlementFailed = true;
        }

        const gameOverPayload = { winner: "draw", reason: "draw", ratings: newRatings, ...(settlementFailed && { settlementFailed: true }) };
        io.to(roomId).emit("gameOver", gameOverPayload);

        const whiteSocketId = userSocketMap.get(whitePlayer?.walletAddress);
        const blackSocketId = userSocketMap.get(blackPlayer?.walletAddress);
        if (whiteSocketId) io.to(whiteSocketId).emit("gameOver", gameOverPayload);
        if (blackSocketId) io.to(blackSocketId).emit("gameOver", gameOverPayload);

        console.log(`[SERVER] Game ${roomId} ended in draw by agreement`);
      } catch (error) {
        console.error("Error processing draw acceptance:", error);
      }
    });

    socket.on("cancelDraw", ({ roomId }) => {
      console.log(`[SERVER] Draw offer cancelled in room ${roomId} by socket ${socket.id}`);
      socket.to(roomId).emit("drawCancelled");
      const roomSockets = io.sockets.adapter.rooms.get(roomId);
      if (roomSockets) {
        roomSockets.forEach(sid => {
          if (sid !== socket.id) {
            io.to(sid).emit("drawCancelled");
          }
        });
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
      cleanupRegularGame(roomId);
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
        markGameCompleted(roomId, 10).catch(() => { });
        setTimeout(() => recentlyCompletedGames.delete(roomId), 10000); // Clean up after 10 seconds

        // Emit gameOver to all players in the room
        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        console.log(`[SERVER] Emitting gameOver to room ${roomId}. Sockets in room:`, roomSockets ? Array.from(roomSockets) : "none");

        // Also emit directly to both players via their socket IDs for reliability
        const whiteSocketId = userSocketMap.get(whitePlayer?.walletAddress);
        const blackSocketId = userSocketMap.get(blackPlayer?.walletAddress);
        console.log(`[SERVER] Direct socket IDs - White: ${whiteSocketId}, Black: ${blackSocketId}`);

        // Settle staked game on-chain before emitting gameOver
        let settlementFailed = false;
        if (game.onChainGameId) {
          const winnerWallet = winnerColor === 'white' ? whitePlayer?.walletAddress : blackPlayer?.walletAddress;
          const settled = await settleStakedGame(game.onChainGameId, winnerWallet, false);
          if (!settled) settlementFailed = true;
        }

        const gameOverPayload = { winner: winnerColor, reason: "resignation", ratings: newRatings, ...(settlementFailed && { settlementFailed: true }) };

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
      cleanupRegularGame(roomId);
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
        markGameCompleted(roomId, 10).catch(() => { });
        setTimeout(() => recentlyCompletedGames.delete(roomId), 10000); // Clean up after 10 seconds

        // Also emit directly to both player sockets for reliability
        const whitePlayer = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
        const blackPlayer = await prisma.user.findUnique({ where: { id: game.blackPlayerId } });

        // Settle staked game on-chain before emitting gameOver
        let settlementFailed = false;
        if (game.onChainGameId) {
          const winnerWallet = winner === 'white' ? whitePlayer?.walletAddress : winner === 'black' ? blackPlayer?.walletAddress : null;
          const settled = await settleStakedGame(game.onChainGameId, winnerWallet, isDraw);
          if (!settled) settlementFailed = true;
        }

        // Emit gameOver to both players
        const gameOverPayload = { winner, reason, ratings: newRatings, ...(settlementFailed && { settlementFailed: true }) };
        io.to(roomId).emit("gameOver", gameOverPayload);

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

    socket.on("gameTimeout", ({ roomId, loser }) => {
      // Legacy: server now handles timeouts authoritatively via gameTimers
      console.log(`[SERVER] Client gameTimeout for room ${roomId} (loser=${loser}) - server handles this now`);
    });

    socket.on("acceptChallenge", async ({ opponentId, userId: myId, stakeEnabled, timeControl }) => {
      const targetSocketId = userSocketMap.get(opponentId);

      if (targetSocketId) {
        try {
          const whiteUser = await prisma.user.findUnique({ where: { walletAddress: opponentId } });
          const blackUser = await prisma.user.findUnique({ where: { walletAddress: myId } });
          const challengeTimeControl = stakeEnabled
            ? normalizeStakedTimeControl(timeControl)
            : normalizeQueueTimeControl(timeControl ?? DEFAULT_GAME_TIME / 60);

          if (whiteUser && blackUser) {
            const whitePlayerRating = getPlayerRatingForTimeControl(whiteUser, challengeTimeControl, !!stakeEnabled);
            const blackPlayerRating = getPlayerRatingForTimeControl(blackUser, challengeTimeControl, !!stakeEnabled);
            const game = await prisma.game.create({
              data: {
                whitePlayerId: whiteUser.id,
                blackPlayerId: blackUser.id,
                fen: "start",
                status: "IN_PROGRESS",
                timeControl: challengeTimeControl,
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
              removeFromAllQueues(s1.id);
              removeFromAllQueues(s2.id);

              io.to(s1.id).emit("matchFound", { roomId, color: "black", opponent: opponentId, playerRating: blackPlayerRating, opponentRating: whitePlayerRating, timeControl: challengeTimeControl });
              io.to(s2.id).emit("matchFound", { roomId, color: "white", opponent: myId, playerRating: whitePlayerRating, opponentRating: blackPlayerRating, timeControl: challengeTimeControl });
              initGameTimer(roomId, getTimeControlSeconds(challengeTimeControl));

              trackActiveRegularGame({
                roomId,
                whiteWallet: opponentId,
                blackWallet: myId,
                whitePlayerRating,
                blackPlayerRating,
                timeControl: challengeTimeControl,
              });

              console.log(`Challenge accepted and persisted: ${opponentId} vs ${myId} in ${roomId}`);
            }
          }
        } catch (error) {
          console.error("Error creating challenge game in DB:", error);
        }
      }
    });

    socket.on("acceptOpenChallenge", async ({ challengeId }) => {
      if (!userId || !challengeId) {
        socket.emit("openChallengeError", { challengeId, error: "Invalid challenge request" });
        return;
      }

      try {
        const challengeSnapshot = await prisma.openChallenge.findUnique({
          where: { id: challengeId },
          include: {
            creator: { select: { walletAddress: true } },
          },
        });

        if (!challengeSnapshot) {
          socket.emit("openChallengeError", { challengeId, error: "Challenge not found" });
          return;
        }

        const joinerActiveGame = await hydrateActiveGame(String(userId));
        if (joinerActiveGame) {
          socket.emit("openChallengeError", {
            challengeId,
            error: "Finish your current game before joining a challenge",
          });
          return;
        }

        const creatorActiveGame = await hydrateActiveGame(challengeSnapshot.creator.walletAddress);
        if (creatorActiveGame) {
          await prisma.openChallenge.updateMany({
            where: {
              id: challengeId,
              status: "OPEN",
            },
            data: {
              status: "CANCELLED",
              cancelledAt: new Date(),
            },
          });

          socket.emit("openChallengeError", {
            challengeId,
            error: "Challenge creator is no longer available",
          });
          return;
        }

        const creatorSocketId = userSocketMap.get(challengeSnapshot.creator.walletAddress);
        if (challengeSnapshot.staked && !creatorSocketId) {
          socket.emit("openChallengeError", {
            challengeId,
            error: "Challenge creator must be online to complete the staked setup",
          });
          return;
        }

        const acceptedChallenge = await prisma.$transaction(async (tx) => {
          const challenge = await tx.openChallenge.findUnique({
            where: { id: challengeId },
            include: {
              creator: {
                select: {
                  id: true,
                  walletAddress: true,
                  rating: true,
                  bulletRating: true,
                  blitzRating: true,
                  rapidRating: true,
                  stakedRating: true,
                },
              },
              acceptedBy: { select: { walletAddress: true } },
            },
          });

          if (!challenge) {
            throw new Error("Challenge not found");
          }

          if (challenge.creator.walletAddress.toLowerCase() === String(userId).toLowerCase()) {
            throw new Error("You cannot accept your own challenge");
          }

          if (challenge.status === "OPEN" && challenge.expiresAt.getTime() <= Date.now()) {
            await tx.openChallenge.update({
              where: { id: challenge.id },
              data: { status: "EXPIRED" },
            });
            throw new Error("Challenge link expired");
          }

          if (challenge.status === "CANCELLED") {
            throw new Error("Challenge was cancelled");
          }

          if (challenge.status === "EXPIRED") {
            throw new Error("Challenge link expired");
          }

          if (challenge.status === "ACCEPTED") {
            if (challenge.acceptedBy?.walletAddress?.toLowerCase() === String(userId).toLowerCase() && challenge.roomId) {
              return {
                challenge,
                game: null,
                joiner: null,
                alreadyAccepted: true,
              };
            }

            throw new Error("Challenge is no longer available");
          }

          const joiner = await tx.user.upsert({
            where: { walletAddress: String(userId) },
            update: {},
            create: { walletAddress: String(userId) },
            select: {
              id: true,
              walletAddress: true,
              rating: true,
              bulletRating: true,
              blitzRating: true,
              rapidRating: true,
              stakedRating: true,
            },
          });

          const isStaked = !!challenge.staked;
          const timeControl = isStaked
            ? normalizeStakedTimeControl(challenge.timeControl)
            : normalizeQueueTimeControl(challenge.timeControl);
          const game = await tx.game.create({
            data: {
              whitePlayerId: challenge.creator.id,
              blackPlayerId: joiner.id,
              fen: "start",
              status: isStaked ? "WAITING" : "IN_PROGRESS",
              timeControl,
              ...(isStaked
                ? {
                    stakeToken: challenge.stakeToken,
                    wagerAmount: parseFloat(challenge.stakeAmount) || 0,
                  }
                : {}),
            },
          });

          const updateResult = await tx.openChallenge.updateMany({
            where: {
              id: challenge.id,
              status: "OPEN",
              acceptedById: null,
            },
            data: {
              status: "ACCEPTED",
              acceptedById: joiner.id,
              roomId: game.id,
              acceptedAt: new Date(),
            },
          });

          if (updateResult.count !== 1) {
            throw new Error("Challenge is no longer available");
          }

          const finalizedChallenge = await tx.openChallenge.findUnique({
            where: { id: challenge.id },
            include: {
              creator: {
                select: {
                  id: true,
                  walletAddress: true,
                  rating: true,
                  bulletRating: true,
                  blitzRating: true,
                  rapidRating: true,
                  stakedRating: true,
                },
              },
              acceptedBy: { select: { walletAddress: true } },
            },
          });

          return {
            challenge: finalizedChallenge,
            game,
            joiner,
            alreadyAccepted: false,
          };
        });

        const acceptedRoomId = acceptedChallenge.challenge?.roomId;
        if (!acceptedRoomId) {
          socket.emit("openChallengeError", { challengeId, error: "Challenge room was not created" });
          return;
        }

        const isStakedChallenge = !!acceptedChallenge.challenge.staked;
        const timeControl = isStakedChallenge
          ? normalizeStakedTimeControl(acceptedChallenge.challenge.timeControl)
          : normalizeQueueTimeControl(acceptedChallenge.challenge.timeControl);

        if (!acceptedChallenge.alreadyAccepted) {
          const whitePlayerRating = getPlayerRatingForTimeControl(
            acceptedChallenge.challenge.creator,
            timeControl,
            isStakedChallenge,
          );
          const blackPlayerRating = getPlayerRatingForTimeControl(
            acceptedChallenge.joiner,
            timeControl,
            isStakedChallenge,
          );

          trackActiveRegularGame({
            roomId: acceptedRoomId,
            whiteWallet: acceptedChallenge.challenge.creator.walletAddress,
            blackWallet: acceptedChallenge.joiner.walletAddress,
            whitePlayerRating,
            blackPlayerRating,
            timeControl,
          });
          if (!isStakedChallenge) {
            initGameTimer(acceptedRoomId, getTimeControlSeconds(timeControl));
          } else {
            scheduleStakeCreationTimeout(acceptedRoomId);
          }

          const creatorSocket = creatorSocketId ? io.sockets.sockets.get(creatorSocketId) : null;
          if (creatorSocket) {
            creatorSocket.join(acceptedRoomId);
            activeGames.set(creatorSocket.id, acceptedRoomId);
            removeFromAllQueues(creatorSocket.id);
          }

          socket.join(acceptedRoomId);
          activeGames.set(socket.id, acceptedRoomId);
          removeFromAllQueues(socket.id);

          const creatorPayload = {
            challengeId,
            roomId: acceptedRoomId,
            color: "white",
            opponent: acceptedChallenge.joiner.walletAddress,
            playerRating: whitePlayerRating,
            opponentRating: blackPlayerRating,
            timeControl,
            staked: isStakedChallenge,
            stakeToken: acceptedChallenge.challenge.stakeToken ?? null,
            stakeAmount: acceptedChallenge.challenge.stakeAmount ?? null,
          };
          const joinerPayload = {
            challengeId,
            roomId: acceptedRoomId,
            color: "black",
            opponent: acceptedChallenge.challenge.creator.walletAddress,
            playerRating: blackPlayerRating,
            opponentRating: whitePlayerRating,
            timeControl,
            staked: isStakedChallenge,
            stakeToken: acceptedChallenge.challenge.stakeToken ?? null,
            stakeAmount: acceptedChallenge.challenge.stakeAmount ?? null,
          };

          if (creatorSocketId) {
            io.to(creatorSocketId).emit("openChallengeAccepted", creatorPayload);
          }
          socket.emit("openChallengeAccepted", joinerPayload);

          console.log(`Open challenge accepted: ${acceptedChallenge.challenge.creator.walletAddress} vs ${acceptedChallenge.joiner.walletAddress} in ${acceptedRoomId}`);
          return;
        }

        socket.emit("openChallengeAccepted", {
          challengeId,
          roomId: acceptedRoomId,
          color: "black",
          opponent: acceptedChallenge.challenge.creator.walletAddress,
          timeControl,
          staked: isStakedChallenge,
          stakeToken: acceptedChallenge.challenge.stakeToken ?? null,
          stakeAmount: acceptedChallenge.challenge.stakeAmount ?? null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to accept challenge";
        socket.emit("openChallengeError", { challengeId, error: message });
        console.error("[OPEN CHALLENGE] accept error:", error);
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

        // Cancel any pending forfeit countdown for this player (reconnected in time)
        const wasPending = cancelForfeitCountdown(tournamentId, uid);

        // Re-join them to their active game room if they have one
        if (wasPending) {
          const player = state.participants.find(
            (p) => normalizeWalletAddress(p.walletAddress) === normalizeWalletAddress(uid),
          );
          if (player) {
            for (const [gameId, gs] of state.roundGames.entries()) {
              if (gs.status === "playing" && (gs.whiteId === player.userId || gs.blackId === player.userId)) {
                socket.join(gameId);
                // Determine their color and opponent
                const isWhite = gs.whiteId === player.userId;
                const opponentParticipant = state.participants.find(
                  (p) => p.userId === (isWhite ? gs.blackId : gs.whiteId),
                );
                socket.emit("tournament:gameStart", {
                  tournamentId,
                  gameId,
                  color: isWhite ? "white" : "black",
                  opponentAddress: opponentParticipant?.walletAddress ?? "",
                  playerRating: player.rating ?? 1200,
                  opponentRating: opponentParticipant?.rating ?? 1200,
                  round: state.currentRound,
                  totalRounds: state.totalRounds,
                  timeControl: state.timeControl,
                });
                console.log(`[TOURNAMENT] Re-joined reconnected player ${uid} to game ${gameId}`);
                break;
              }
            }
          }
        }
      }

      // Send current state if tournament is active
      if (state) {
        // Determine the correct phase for this specific player
        let playerPhase = "lobby";
        if (state.startingEndTime && state.startingEndTime > Date.now()) {
          // Tournament is in the starting countdown
          playerPhase = "starting";
          const remainingMs = state.startingEndTime - Date.now();
          socket.emit("tournament:starting", {
            tournamentId,
            totalRounds: state.totalRounds,
            totalPlayers: state.participants.length,
            timeControl: state.timeControl,
            startsIn: Math.ceil(remainingMs / 1000),
            standings: getTournamentStandings(state),
          });
        } else if (state.currentRound > 0) {
          const regPlayer = state.participants.find(
            (p) => normalizeWalletAddress(p.walletAddress) === normalizeWalletAddress(uid),
          );
          if (regPlayer) {
            let inActiveGame = false;
            let hasBye = true; // assume bye unless we find them in a pairing
            for (const [, gs] of state.roundGames.entries()) {
              if (gs.whiteId === regPlayer.userId || gs.blackId === regPlayer.userId) {
                hasBye = false;
                if (gs.status === "playing") inActiveGame = true;
                break;
              }
            }
            if (hasBye) {
              playerPhase = "bye";
              // Re-send bye event so client gets correct phase
              socket.emit("tournament:bye", {
                tournamentId,
                round: state.currentRound,
                totalRounds: state.totalRounds,
              });
            } else if (inActiveGame) {
              playerPhase = "playing";
            } else {
              playerPhase = "round-waiting";
            }
          } else {
            playerPhase = "playing";
          }
        }

        socket.emit("tournament:state", {
          tournamentId,
          phase: playerPhase,
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

            // Only start forfeit countdown if player has an active game this round
            const disconnPlayer = tState.participants.find(
              (p) => normalizeWalletAddress(p.walletAddress) === normalizeWalletAddress(disconnectingUserId),
            );
            if (disconnPlayer) {
              let hasActiveGame = false;
              for (const [, gs] of tState.roundGames.entries()) {
                if (gs.status === "playing" && (gs.whiteId === disconnPlayer.userId || gs.blackId === disconnPlayer.userId)) {
                  hasActiveGame = true;
                  break;
                }
              }
              if (hasActiveGame) {
                startForfeitCountdown(tournamentId, disconnectingUserId);
              } else {
                console.log(`[TOURNAMENT] Player ${disconnectingUserId} disconnected but has no active game — skipping forfeit countdown`);
              }
            }

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

      // Remove from all matchmaking queues
      removeFromAllQueues(socket.id);

      // ─── Regular game disconnect: 30s grace period ───
      const activeRoomId = activeGames.get(socket.id);
      if (activeRoomId) {
        console.log(`Socket ${socket.id} disconnected from active room ${activeRoomId}`);

        let disconnectedUserId = null;
        for (const [uid, sid] of userSocketMap.entries()) {
          if (sid === socket.id) {
            disconnectedUserId = uid;
            break;
          }
        }

        // Skip if recently completed or no user
        if (!recentlyCompletedGames.has(activeRoomId) && disconnectedUserId) {
          // Check if it's a tournament game — if so, tournament handler above already dealt with it
          const isTournamentGame = disconnectingUserId && playerTournamentMap.has(disconnectingUserId);
          if (!isTournamentGame) {
            (async () => {
              try {
                const game = await prisma.game.findUnique({ where: { id: activeRoomId } });

                // ─── WAITING staked game: preserve the room once the on-chain game exists ───
                if (game && game.status === "WAITING") {
                  if (game.onChainGameId) {
                    console.log(`[DISCONNECT] Player disconnected from WAITING game ${activeRoomId} after on-chain creation — preserving room for reconnect/confirm`);
                    return;
                  }

                  console.log(`[DISCONNECT] Player disconnected from WAITING game ${activeRoomId} — aborting`);

                  // Clear the post-create staked confirm timeout if it exists
                  const timeout = stakeTimeouts.get(activeRoomId);
                  if (timeout) { clearTimeout(timeout); stakeTimeouts.delete(activeRoomId); }

                  await prisma.game.update({ where: { id: activeRoomId }, data: { status: "ABORTED" } });

                  // Notify Player 1 (white) so they can cancel on-chain and reclaim stake
                  const whitePlayer = await prisma.user.findUnique({ where: { id: game.whitePlayerId } });
                  if (whitePlayer) {
                    const whiteSid = getSocketIdForWallet(whitePlayer.walletAddress);
                    if (whiteSid) {
                      io.to(whiteSid).emit("opponentDeclinedStake", { roomId: activeRoomId, onChainGameId: game.onChainGameId });
                    }
                  }

                  cleanupRegularGame(activeRoomId);
                  return;
                }

                if (game && game.status === "IN_PROGRESS") {
                  // Race condition guard: check if player already reconnected during the async DB wait
                  const currentSocketId = userSocketMap.get(disconnectedUserId);
                  if (currentSocketId && currentSocketId !== socket.id) {
                    console.log(`[DISCONNECT] Player ${disconnectedUserId} already reconnected (new socket ${currentSocketId}), skipping grace period`);
                    return;
                  }

                  const deadline = Date.now() + 30000;

                  console.log(`[DISCONNECT] Starting 30s grace period for ${disconnectedUserId} in game ${activeRoomId}`);

                  // Notify opponent
                  socket.to(activeRoomId).emit("opponentDisconnecting", { deadline });
                  const roomSockets = io.sockets.adapter.rooms.get(activeRoomId);
                  if (roomSockets) {
                    roomSockets.forEach(sid => {
                      if (sid !== socket.id) io.to(sid).emit("opponentDisconnecting", { deadline });
                    });
                  }

                  const timer = setTimeout(async () => {
                    gameDisconnectTimers.delete(disconnectedUserId);

                    // Safety: check if player reconnected before forfeiting
                    const currentSid = userSocketMap.get(disconnectedUserId);
                    if (currentSid) {
                      console.log(`[DISCONNECT] Player ${disconnectedUserId} has reconnected, skipping forfeit`);
                      return;
                    }

                    // Re-check game status in case it ended during grace period
                    const freshGame = await prisma.game.findUnique({ where: { id: activeRoomId } });
                    if (!freshGame || freshGame.status !== "IN_PROGRESS") return;

                    console.log(`[DISCONNECT] 30s expired for ${disconnectedUserId} — forfeiting game ${activeRoomId}`);

                    const whiteUser = await prisma.user.findUnique({ where: { id: freshGame.whitePlayerId } });
                    const blackUser = await prisma.user.findUnique({ where: { id: freshGame.blackPlayerId } });

                    let winnerId = null;
                    let winnerColor = null;
                    if (whiteUser?.walletAddress === disconnectedUserId) { winnerId = freshGame.blackPlayerId; winnerColor = "black"; }
                    else if (blackUser?.walletAddress === disconnectedUserId) { winnerId = freshGame.whitePlayerId; winnerColor = "white"; }

                    if (winnerId) {
                      await prisma.game.update({ where: { id: activeRoomId }, data: { status: "COMPLETED", winnerId } });
                      const updatedGame = { ...freshGame, winnerId };
                      const newRatings = await updateRatings(updatedGame);

                      recentlyCompletedGames.add(activeRoomId);
                      markGameCompleted(activeRoomId, 10).catch(() => { });
                      setTimeout(() => recentlyCompletedGames.delete(activeRoomId), 10000);

                      const gameOverPayload = { winner: winnerColor, reason: "disconnection", ratings: newRatings };

                      // Only emit to the winner's socket — do NOT broadcast to the room,
                      // because the disconnected player's socket may still be in the room
                      // and would incorrectly receive the gameOver event.
                      const opponentWallet = whiteUser?.walletAddress === disconnectedUserId ? blackUser?.walletAddress : whiteUser?.walletAddress;
                      const opponentSid = opponentWallet ? userSocketMap.get(opponentWallet) : null;
                      if (opponentSid) io.to(opponentSid).emit("gameOver", gameOverPayload);

                      console.log(`[DISCONNECT] Game ${activeRoomId} forfeited by ${disconnectedUserId}. Winner: ${winnerColor}`);
                    }

                    cleanupRegularGame(activeRoomId);
                  }, 30000);

                  gameDisconnectTimers.set(disconnectedUserId, { roomId: activeRoomId, timer, deadline });
                }
              } catch (e) {
                console.error("Error handling disconnect grace period:", e);
              }
            })();
          }
        }

        activeGames.delete(socket.id);
      }

      if (userId) {
        for (const [pendingRoomId, request] of rematchRequests.entries()) {
          const normalizedUserId = String(userId).toLowerCase();
          const requesterMatches = request.requesterWallet.toLowerCase() === normalizedUserId;
          const targetMatches = request.targetWallet.toLowerCase() === normalizedUserId;
          if (!requesterMatches && !targetMatches) continue;

          clearRematchRequest(pendingRoomId);
          const otherWallet = requesterMatches ? request.targetWallet : request.requesterWallet;
          const otherSocketId = userSocketMap.get(otherWallet);
          if (otherSocketId) {
            io.to(otherSocketId).emit("rematchExpired", { roomId: pendingRoomId });
          }
        }

        const currentSocketId = getSocketIdForWallet(userId);
        if (currentSocketId === socket.id) {
          for (const [connectedWallet, mappedSocketId] of userSocketMap.entries()) {
            if (
              normalizeWalletAddress(connectedWallet) === normalizeWalletAddress(userId) &&
              mappedSocketId === socket.id
            ) {
              userSocketMap.delete(connectedWallet);
              deleteUserSocket(connectedWallet).catch(() => { }); // mirror to Redis
            }
          }
        }
      } else {
        for (const [uid, sid] of userSocketMap.entries()) {
          if (sid === socket.id) {
            userSocketMap.delete(uid);
            deleteUserSocket(uid).catch(() => { }); // mirror to Redis
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
