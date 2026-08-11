/**
 * STRESS TEST 2 — Matchmaking & Gameplay Under Load
 *
 * Pairs up N players via the matchmaking queue, then each pair plays
 * random moves until checkmate/stalemate or a move limit. Measures
 * match latency, move round-trip times, and error rates.
 *
 * Requires the DB to have users for each wallet, or use the server's
 * auto-upsert flow. If users don't exist, matchmaking will fail; the
 * test tracks those failures.
 *
 * Usage:
 *   node stress-test/02-gameplay.mjs [pairs] [movesPerGame] [timeControl]
 *
 * Example:
 *   node stress-test/02-gameplay.mjs 50 30 3
 */
import { Chess } from "chess.js";
import {
  connectSocket,
  randomWallet,
  waitForEvent,
  playRandomMove,
  sleep,
  Metrics,
  MemorySampler,
} from "./helpers.mjs";

const NUM_PAIRS = parseInt(process.argv[2] || "20", 10);
const MOVES_PER_GAME = parseInt(process.argv[3] || "30", 10);
const TIME_CONTROL = parseInt(process.argv[4] || "3", 10);
const TOTAL_PLAYERS = NUM_PAIRS * 2;

async function createPlayerSocket() {
  const wallet = randomWallet();
  const socket = await connectSocket(wallet);
  return { wallet, socket };
}

async function playGame(whitePlayer, blackPlayer, metrics, gameIndex) {
  const { socket: ws } = whitePlayer;
  const { socket: bs } = blackPlayer;
  const chess = new Chess();

  // Both join the matchmaking queue
  const t0 = Date.now();
  const matchPromises = [
    waitForEvent(ws, "matchFound", 30000),
    waitForEvent(bs, "matchFound", 30000),
  ];

  ws.emit("joinQueue", { userId: whitePlayer.wallet, timeControl: TIME_CONTROL });
  bs.emit("joinQueue", { userId: blackPlayer.wallet, timeControl: TIME_CONTROL });

  let whiteMatch, blackMatch;
  try {
    [whiteMatch, blackMatch] = await Promise.all(matchPromises);
    metrics.timing("matchmaking", Date.now() - t0);
    metrics.inc("matches_found");
  } catch (err) {
    metrics.error(`Game #${gameIndex}: matchmaking failed — ${err.message}`);
    metrics.inc("matchmaking_failed");
    return;
  }

  const roomId = whiteMatch.roomId;
  if (!roomId) {
    metrics.error(`Game #${gameIndex}: no roomId in matchFound`);
    return;
  }

  // Determine colors
  const white = whiteMatch.color === "white" ? ws : bs;
  const black = whiteMatch.color === "white" ? bs : ws;
  const whiteWallet = whiteMatch.color === "white" ? whitePlayer.wallet : blackPlayer.wallet;
  const blackWallet = whiteMatch.color === "white" ? blackPlayer.wallet : whitePlayer.wallet;

  // Join room
  white.emit("joinRoom", { roomId });
  black.emit("joinRoom", { roomId });
  await sleep(100);

  // Play random moves
  let moveCount = 0;
  let gameOver = false;

  const gameOverPromise = new Promise((resolve) => {
    const handler = (data) => {
      gameOver = true;
      resolve(data);
    };
    white.once("gameOver", handler);
    black.once("gameOver", handler);
  });

  for (let m = 0; m < MOVES_PER_GAME && !gameOver; m++) {
    const isWhiteTurn = chess.turn() === "w";
    const mover = isWhiteTurn ? white : black;
    const waiter = isWhiteTurn ? black : white;

    const moveData = playRandomMove(chess);
    if (!moveData) break; // no legal moves (checkmate/stalemate reached by chess.js)

    const t1 = Date.now();

    // Listen for the move to arrive at the opponent
    const opponentMovePromise = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 5000);
      waiter.once("opponentMove", (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });

    mover.emit("movePiece", {
      roomId,
      move: moveData.move,
      fen: moveData.fen,
      moveRecord: moveData.moveRecord,
    });

    const received = await opponentMovePromise;
    if (received) {
      metrics.timing("move_rtt", Date.now() - t1);
      metrics.inc("moves_delivered");
    } else {
      metrics.inc("moves_lost");
      metrics.error(`Game #${gameIndex}, move #${m}: opponent didn't receive move`);
    }
    moveCount++;

    // Check for checkmate/stalemate/draw on the chess.js instance
    if (chess.isGameOver()) {
      let winner = "draw";
      let reason = "draw";
      if (chess.isCheckmate()) {
        winner = chess.turn() === "w" ? "black" : "white";
        reason = "checkmate";
      } else if (chess.isStalemate()) {
        reason = "stalemate";
      }
      mover.emit("gameComplete", { roomId, winner, reason });
      gameOver = true;
      break;
    }

    // Tiny delay between moves to avoid pure CPU spin
    if (m % 4 === 3) await sleep(10);
  }

  // If game didn't end naturally, resign to clean up
  if (!gameOver) {
    white.emit("resign", { roomId });
    try {
      await Promise.race([
        gameOverPromise,
        sleep(3000).then(() => null),
      ]);
    } catch {
      // ignore timeout
    }
  }

  metrics.inc("games_completed");
  metrics.inc("total_moves", moveCount);
}

async function run() {
  const metrics = new Metrics(
    `Gameplay Load (${NUM_PAIRS} pairs, ${MOVES_PER_GAME} moves/game, tc=${TIME_CONTROL})`
  );
  const memory = new MemorySampler(2000);

  console.log(`[GAMEPLAY] Creating ${TOTAL_PLAYERS} player sockets...`);
  metrics.start();
  memory.start();

  // Connect all players
  const players = [];
  const CONNECT_BATCH = 20;
  for (let i = 0; i < TOTAL_PLAYERS; i += CONNECT_BATCH) {
    const batch = [];
    for (let j = i; j < Math.min(i + CONNECT_BATCH, TOTAL_PLAYERS); j++) {
      batch.push(
        createPlayerSocket()
          .then((p) => {
            metrics.inc("connected");
            return p;
          })
          .catch((err) => {
            metrics.error(`Connect failed (player #${j}): ${err.message}`);
            metrics.inc("connect_failed");
            return null;
          })
      );
    }
    const results = await Promise.all(batch);
    players.push(...results.filter(Boolean));
    await sleep(50);
  }

  console.log(`[GAMEPLAY] ${players.length} connected. Pairing into ${Math.floor(players.length / 2)} games...`);

  // Pair up players and run games in parallel batches
  const pairs = [];
  for (let i = 0; i + 1 < players.length; i += 2) {
    pairs.push([players[i], players[i + 1]]);
  }

  const GAME_BATCH = 10;
  for (let b = 0; b < pairs.length; b += GAME_BATCH) {
    const gameBatch = pairs.slice(b, b + GAME_BATCH);
    const gamePromises = gameBatch.map(([p1, p2], idx) =>
      playGame(p1, p2, metrics, b + idx).catch((err) => {
        metrics.error(`Game #${b + idx} threw: ${err.message}`);
      })
    );
    await Promise.all(gamePromises);
    console.log(`  [batch] Completed games ${b + 1}-${Math.min(b + GAME_BATCH, pairs.length)} / ${pairs.length}`);
  }

  // Disconnect
  console.log(`[GAMEPLAY] Disconnecting all players...`);
  for (const p of players) {
    p.socket.disconnect();
  }
  await sleep(2000);

  metrics.stop();
  memory.stop();
  memory.report();
  const result = metrics.report();

  const matchFail = metrics.counters.matchmaking_failed || 0;
  const totalGames = pairs.length;
  if (matchFail > totalGames * 0.2) {
    console.log(`\n❌ FAIL: ${matchFail}/${totalGames} matchmaking failures (>20%)`);
    process.exit(1);
  } else {
    console.log(`\n✅ PASS: ${metrics.counters.games_completed || 0}/${totalGames} games completed`);
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
