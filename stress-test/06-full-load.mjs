/**
 * STRESS TEST 6 — Combined Full Load
 *
 * Runs connections + gameplay + spectators + event flood simultaneously
 * to find the breaking point. This is the "how much can it handle before
 * crashing" test.
 *
 * It ramps up load in phases, printing metrics after each phase.
 * When a phase crosses the failure threshold, it reports the breaking point.
 *
 * Usage:
 *   node stress-test/06-full-load.mjs [startPairs] [maxPairs] [step] [movesPerGame]
 *
 * Example:
 *   node stress-test/06-full-load.mjs 5 100 10 20
 */
import { Chess } from "chess.js";
import {
  connectSocket,
  randomWallet,
  waitForEvent,
  playRandomMove,
  sleep,
  Metrics,
} from "./helpers.mjs";

const START_PAIRS = parseInt(process.argv[2] || "5", 10);
const MAX_PAIRS = parseInt(process.argv[3] || "80", 10);
const STEP = parseInt(process.argv[4] || "10", 10);
const MOVES_PER_GAME = parseInt(process.argv[5] || "20", 10);
const TIME_CONTROL = 3;
const SPECTATORS_PER_PHASE = 10;
const FAIL_THRESHOLD = 0.3; // 30% failure = breaking point

async function runPhase(numPairs, phaseIndex) {
  const metrics = new Metrics(`Phase ${phaseIndex} (${numPairs} pairs + ${SPECTATORS_PER_PHASE} spectators)`);
  metrics.start();

  const players = [];
  const spectators = [];
  const totalPlayers = numPairs * 2;

  // Connect players
  const BATCH = 20;
  for (let b = 0; b < totalPlayers; b += BATCH) {
    const batch = [];
    for (let i = b; i < Math.min(b + BATCH, totalPlayers); i++) {
      batch.push(
        connectSocket(randomWallet(), { timeout: 12000 })
          .then((socket) => {
            metrics.inc("players_connected");
            return socket;
          })
          .catch((err) => {
            metrics.error(`Player connect failed: ${err.message}`);
            metrics.inc("player_connect_failed");
            return null;
          })
      );
    }
    const results = await Promise.all(batch);
    players.push(...results.filter(Boolean));
    await sleep(30);
  }

  // Connect spectators
  for (let i = 0; i < SPECTATORS_PER_PHASE; i++) {
    try {
      const s = await connectSocket(randomWallet(), { timeout: 8000 });
      spectators.push(s);
      metrics.inc("spectators_connected");
    } catch {
      metrics.inc("spectator_connect_failed");
    }
  }

  // Pair up and play
  const pairs = [];
  for (let i = 0; i + 1 < players.length; i += 2) {
    pairs.push([players[i], players[i + 1]]);
  }

  const GAME_BATCH = 5;
  for (let b = 0; b < pairs.length; b += GAME_BATCH) {
    const gameBatch = pairs.slice(b, b + GAME_BATCH);
    await Promise.all(
      gameBatch.map(async ([ws, bs], idx) => {
        const chess = new Chess();
        const w_wallet = ws.io.opts.query?.userId;
        const b_wallet = bs.io.opts.query?.userId;

        const t0 = Date.now();
        const matchPromises = [
          waitForEvent(ws, "matchFound", 20000).catch(() => null),
          waitForEvent(bs, "matchFound", 20000).catch(() => null),
        ];
        ws.emit("joinQueue", { userId: w_wallet, timeControl: TIME_CONTROL });
        bs.emit("joinQueue", { userId: b_wallet, timeControl: TIME_CONTROL });

        const [whiteMatch, blackMatch] = await Promise.all(matchPromises);
        if (!whiteMatch || !blackMatch) {
          metrics.error(`Game ${b + idx}: matchmaking fail`);
          metrics.inc("match_failed");
          return;
        }
        metrics.timing("matchmaking", Date.now() - t0);
        metrics.inc("matches_ok");

        const roomId = whiteMatch.roomId;
        const white = whiteMatch.color === "white" ? ws : bs;
        const black = whiteMatch.color === "white" ? bs : ws;

        white.emit("joinRoom", { roomId });
        black.emit("joinRoom", { roomId });
        await sleep(50);

        // Play moves
        let moveCount = 0;
        for (let m = 0; m < MOVES_PER_GAME; m++) {
          const isWhiteTurn = chess.turn() === "w";
          const mover = isWhiteTurn ? white : black;
          const waiter = isWhiteTurn ? black : white;

          const moveData = playRandomMove(chess);
          if (!moveData) break;

          const t1 = Date.now();
          const opMovePromise = new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 3000);
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

          const received = await opMovePromise;
          if (received) {
            metrics.timing("move_rtt", Date.now() - t1);
            metrics.inc("moves_ok");
          } else {
            metrics.inc("moves_lost");
          }
          moveCount++;

          if (chess.isGameOver()) {
            let winner = "draw";
            let reason = "draw";
            if (chess.isCheckmate()) {
              winner = chess.turn() === "w" ? "black" : "white";
              reason = "checkmate";
            }
            mover.emit("gameComplete", { roomId, winner, reason });
            break;
          }

          if (m % 4 === 3) await sleep(5);
        }

        if (!chess.isGameOver()) {
          white.emit("resign", { roomId });
          await sleep(200);
        }

        metrics.inc("games_done");
        metrics.inc("total_moves", moveCount);
      })
    );
  }

  // Measure ping latency while games were running
  const pingResults = await Promise.all(
    spectators.map(
      (s) =>
        new Promise((resolve) => {
          const t0 = Date.now();
          s.emit("ping", { timestamp: t0 });
          const timer = setTimeout(() => {
            metrics.inc("spectator_ping_timeout");
            resolve(null);
          }, 5000);
          s.once("pong", () => {
            clearTimeout(timer);
            const rtt = Date.now() - t0;
            metrics.timing("spectator_ping", rtt);
            resolve(rtt);
          });
        })
    )
  );

  // Cleanup
  for (const s of [...players, ...spectators]) {
    try { s.disconnect(); } catch {}
  }
  await sleep(500);

  metrics.stop();
  return metrics;
}

async function run() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║        CHESSDICT FULL LOAD STRESS TEST          ║");
  console.log("║  Ramping from", String(START_PAIRS).padStart(3), "to", String(MAX_PAIRS).padStart(3), "concurrent game pairs     ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const results = [];
  let breakingPoint = null;

  for (let pairs = START_PAIRS; pairs <= MAX_PAIRS; pairs += STEP) {
    const phaseIndex = results.length + 1;
    console.log(`\n${"─".repeat(50)}`);
    console.log(`PHASE ${phaseIndex}: ${pairs} pairs (${pairs * 2} players + ${SPECTATORS_PER_PHASE} spectators)`);
    console.log(`${"─".repeat(50)}`);

    let phaseMetrics;
    try {
      phaseMetrics = await runPhase(pairs, phaseIndex);
    } catch (err) {
      console.error(`\n💥 Phase ${phaseIndex} CRASHED: ${err.message}`);
      breakingPoint = { pairs, phase: phaseIndex, reason: `crash: ${err.message}` };
      break;
    }

    phaseMetrics.report();

    const matchFailed = phaseMetrics.counters.match_failed || 0;
    const matchOk = phaseMetrics.counters.matches_ok || 0;
    const movesLost = phaseMetrics.counters.moves_lost || 0;
    const movesOk = phaseMetrics.counters.moves_ok || 0;
    const connectFailed = phaseMetrics.counters.player_connect_failed || 0;
    const totalConnect = (phaseMetrics.counters.players_connected || 0) + connectFailed;

    const failRate = totalConnect > 0 ? connectFailed / totalConnect : 0;
    const matchFailRate = (matchOk + matchFailed) > 0 ? matchFailed / (matchOk + matchFailed) : 0;
    const moveLossRate = (movesOk + movesLost) > 0 ? movesLost / (movesOk + movesLost) : 0;

    results.push({
      pairs,
      phase: phaseIndex,
      connectFailRate: failRate,
      matchFailRate,
      moveLossRate,
      avgMoveRtt: phaseMetrics.timings.move_rtt
        ? phaseMetrics.timings.move_rtt.reduce((a, b) => a + b, 0) / phaseMetrics.timings.move_rtt.length
        : 0,
      avgMatchmaking: phaseMetrics.timings.matchmaking
        ? phaseMetrics.timings.matchmaking.reduce((a, b) => a + b, 0) / phaseMetrics.timings.matchmaking.length
        : 0,
      metrics: phaseMetrics,
    });

    if (failRate > FAIL_THRESHOLD || matchFailRate > FAIL_THRESHOLD || moveLossRate > FAIL_THRESHOLD) {
      const reasons = [];
      if (failRate > FAIL_THRESHOLD) reasons.push(`connect failures ${(failRate * 100).toFixed(0)}%`);
      if (matchFailRate > FAIL_THRESHOLD) reasons.push(`match failures ${(matchFailRate * 100).toFixed(0)}%`);
      if (moveLossRate > FAIL_THRESHOLD) reasons.push(`move loss ${(moveLossRate * 100).toFixed(0)}%`);
      breakingPoint = { pairs, phase: phaseIndex, reason: reasons.join(", ") };
      break;
    }

    // Brief cooldown between phases
    console.log(`\nCooldown 3s before next phase...`);
    await sleep(3000);
  }

  // Final summary
  console.log(`\n${"═".repeat(60)}`);
  console.log("  FULL LOAD TEST SUMMARY");
  console.log(`${"═".repeat(60)}`);
  console.log(`  Phase | Pairs | Connect% | Match% | MoveRTT  | MoveLoss%`);
  console.log(`  ${"─".repeat(55)}`);
  for (const r of results) {
    console.log(
      `    ${String(r.phase).padStart(2)}  |` +
      `  ${String(r.pairs).padStart(3)}  |` +
      `  ${((1 - r.connectFailRate) * 100).toFixed(0).padStart(4)}%   |` +
      `  ${((1 - r.matchFailRate) * 100).toFixed(0).padStart(3)}%  |` +
      `  ${r.avgMoveRtt.toFixed(0).padStart(5)}ms  |` +
      `  ${(r.moveLossRate * 100).toFixed(1).padStart(5)}%`
    );
  }
  console.log(`${"═".repeat(60)}`);

  if (breakingPoint) {
    console.log(`\n💥 BREAKING POINT: ${breakingPoint.pairs} pairs (phase ${breakingPoint.phase})`);
    console.log(`   Reason: ${breakingPoint.reason}`);
    const lastGood = results.length >= 2 ? results[results.length - 2] : null;
    if (lastGood) {
      console.log(`   Last stable: ${lastGood.pairs} pairs (${lastGood.pairs * 2} concurrent players)`);
    }
    process.exit(1);
  } else {
    console.log(`\n✅ Server handled all phases up to ${MAX_PAIRS} pairs (${MAX_PAIRS * 2} players) without hitting the failure threshold.`);
    console.log(`   Increase MAX_PAIRS to find the actual ceiling.`);
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
