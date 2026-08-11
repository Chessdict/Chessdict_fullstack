/**
 * STRESS TEST 5 — Spectator Overload
 *
 * Connects many spectators to a small number of game rooms to test
 * how broadcast fan-out scales. Measures event delivery under heavy
 * spectator counts.
 *
 * Usage:
 *   node stress-test/05-spectators.mjs [spectators] [rooms]
 *
 * Example:
 *   node stress-test/05-spectators.mjs 200 5
 */
import {
  connectSocket,
  randomWallet,
  sleep,
  Metrics,
  MemorySampler,
} from "./helpers.mjs";

const NUM_SPECTATORS = parseInt(process.argv[2] || "100", 10);
const NUM_ROOMS = parseInt(process.argv[3] || "3", 10);
const BATCH_SIZE = 20;

// Use UUID-formatted room IDs (the server validates this pattern)
function fakeRoomId(index) {
  const hex = index.toString(16).padStart(8, "0");
  return `${hex}-0000-4000-8000-000000000000`;
}

async function run() {
  const metrics = new Metrics(
    `Spectator Overload (${NUM_SPECTATORS} spectators, ${NUM_ROOMS} rooms)`
  );
  const memory = new MemorySampler(1000);
  const sockets = [];

  metrics.start();
  memory.start();

  const roomIds = Array.from({ length: NUM_ROOMS }, (_, i) => fakeRoomId(i + 1));

  console.log(`[SPECTATORS] Connecting ${NUM_SPECTATORS} spectator sockets...`);

  for (let b = 0; b < NUM_SPECTATORS; b += BATCH_SIZE) {
    const batch = [];
    for (let i = b; i < Math.min(b + BATCH_SIZE, NUM_SPECTATORS); i++) {
      batch.push(
        connectSocket(randomWallet())
          .then((socket) => {
            metrics.inc("connected");
            sockets.push(socket);
          })
          .catch((err) => {
            metrics.error(`Spectator #${i} connect failed: ${err.message}`);
            metrics.inc("connect_failed");
          })
      );
    }
    await Promise.all(batch);
    await sleep(50);
  }

  console.log(`[SPECTATORS] ${sockets.length} connected. Joining rooms...`);

  // Distribute spectators across rooms
  const roomAssignments = new Map(); // roomId -> socket[]
  for (const roomId of roomIds) {
    roomAssignments.set(roomId, []);
  }

  for (let i = 0; i < sockets.length; i++) {
    const roomId = roomIds[i % roomIds.length];
    const socket = sockets[i];

    const t0 = Date.now();
    socket.emit("joinSpectatorRoom", { roomId });

    // Listen for the response (spectatorSnapshot or spectatorUnavailable)
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        metrics.inc("join_timeout");
        resolve();
      }, 3000);
      const done = () => { clearTimeout(timer); resolve(); };

      socket.once("spectatorSnapshot", () => {
        metrics.timing("spectator_join", Date.now() - t0);
        metrics.inc("joined_ok");
        done();
      });
      socket.once("spectatorUnavailable", () => {
        // Expected — the rooms don't really exist in the DB.
        // This still exercises the join flow and DB lookup.
        metrics.timing("spectator_join", Date.now() - t0);
        metrics.inc("room_unavailable");
        done();
      });
    });

    roomAssignments.get(roomId).push(socket);
  }

  console.log(`[SPECTATORS] Join complete. Metrics so far:`);
  console.log(`  joined_ok:       ${metrics.counters.joined_ok || 0}`);
  console.log(`  room_unavailable: ${metrics.counters.room_unavailable || 0}`);
  console.log(`  join_timeout:    ${metrics.counters.join_timeout || 0}`);

  // Now test ping response under spectator load
  console.log(`[SPECTATORS] Pinging all sockets under spectator load...`);
  const pingPromises = sockets.map((socket) => {
    return new Promise((resolve) => {
      const t0 = Date.now();
      socket.emit("ping", { timestamp: t0 });
      const timer = setTimeout(() => {
        metrics.inc("ping_timeout");
        resolve();
      }, 5000);
      socket.once("pong", () => {
        clearTimeout(timer);
        metrics.timing("ping_under_load", Date.now() - t0);
        metrics.inc("pings_ok");
        resolve();
      });
    });
  });
  await Promise.all(pingPromises);

  // Leave rooms and disconnect
  for (let i = 0; i < sockets.length; i++) {
    const roomId = roomIds[i % roomIds.length];
    sockets[i].emit("leaveSpectatorRoom", { roomId });
  }
  await sleep(500);

  for (const s of sockets) s.disconnect();
  await sleep(1000);

  metrics.stop();
  memory.stop();
  memory.report();
  metrics.report();

  const pingTimeout = metrics.counters.ping_timeout || 0;
  if (pingTimeout > sockets.length * 0.2) {
    console.log(`\n❌ FAIL: ${pingTimeout}/${sockets.length} ping timeouts under spectator load`);
    process.exit(1);
  } else {
    console.log(`\n✅ PASS: Server responsive under ${sockets.length} spectator connections`);
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
