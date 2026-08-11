/**
 * STRESS TEST 4 — Reconnection Storm
 *
 * Simulates the real-world scenario of many users reconnecting at once
 * (e.g., after a brief network blip or server restart). Measures how
 * well the server handles reconnection + game state hydration under load.
 *
 * Usage:
 *   node stress-test/04-reconnect-storm.mjs [players] [disconnectCycles]
 *
 * Example:
 *   node stress-test/04-reconnect-storm.mjs 100 3
 */
import {
  connectSocket,
  randomWallet,
  waitForEvent,
  sleep,
  Metrics,
  MemorySampler,
} from "./helpers.mjs";

const NUM_PLAYERS = parseInt(process.argv[2] || "50", 10);
const DISCONNECT_CYCLES = parseInt(process.argv[3] || "3", 10);

async function run() {
  const metrics = new Metrics(
    `Reconnection Storm (${NUM_PLAYERS} players × ${DISCONNECT_CYCLES} cycles)`
  );
  const memory = new MemorySampler(1000);

  metrics.start();
  memory.start();

  const wallets = Array.from({ length: NUM_PLAYERS }, () => randomWallet());

  for (let cycle = 0; cycle < DISCONNECT_CYCLES; cycle++) {
    console.log(`[RECONNECT] Cycle ${cycle + 1}/${DISCONNECT_CYCLES}: connecting ${NUM_PLAYERS} players...`);

    // Connect all players in parallel
    const connectStart = Date.now();
    const sockets = [];
    const BATCH = 25;

    for (let b = 0; b < wallets.length; b += BATCH) {
      const batch = wallets.slice(b, b + BATCH).map(async (wallet) => {
        const t0 = Date.now();
        try {
          const socket = await connectSocket(wallet, { timeout: 15000 });
          metrics.timing("reconnect_time", Date.now() - t0);
          metrics.inc("reconnects_ok");
          return { wallet, socket };
        } catch (err) {
          metrics.error(`Cycle ${cycle + 1} connect failed for ${wallet.slice(0, 10)}: ${err.message}`);
          metrics.inc("reconnects_failed");
          return null;
        }
      });
      const results = await Promise.all(batch);
      sockets.push(...results.filter(Boolean));
      await sleep(50);
    }

    const connectDuration = Date.now() - connectStart;
    console.log(`  Connected: ${sockets.length}/${wallets.length} in ${connectDuration}ms`);

    // Each socket pings to verify it's functional
    let pingsOk = 0;
    const pingPromises = sockets.map(({ socket }) => {
      return new Promise((resolve) => {
        const t0 = Date.now();
        socket.emit("ping", { timestamp: t0 });
        const timer = setTimeout(() => {
          metrics.inc("ping_timeout");
          resolve();
        }, 3000);
        socket.once("pong", () => {
          clearTimeout(timer);
          metrics.timing("ping_rtt", Date.now() - t0);
          pingsOk++;
          resolve();
        });
      });
    });
    await Promise.all(pingPromises);
    console.log(`  Pings OK: ${pingsOk}/${sockets.length}`);

    // Hold for a second, then disconnect all simultaneously (simulating a blip)
    await sleep(1000);

    console.log(`  Disconnecting all ${sockets.length} simultaneously...`);
    const disconnectStart = Date.now();
    for (const { socket } of sockets) {
      socket.disconnect();
    }
    metrics.inc("disconnect_cycles");

    // Brief pause before reconnecting (simulating network recovery)
    await sleep(500);
    console.log(`  Disconnect took ${Date.now() - disconnectStart}ms`);
  }

  metrics.stop();
  memory.stop();
  memory.report();
  metrics.report();

  const failRate = (metrics.counters.reconnects_failed || 0) /
    (NUM_PLAYERS * DISCONNECT_CYCLES);
  if (failRate > 0.15) {
    console.log(`\n❌ FAIL: Reconnection failure rate ${(failRate * 100).toFixed(1)}% (>15%)`);
    process.exit(1);
  } else {
    console.log(`\n✅ PASS: ${(failRate * 100).toFixed(1)}% reconnection failure rate`);
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
