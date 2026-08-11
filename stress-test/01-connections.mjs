/**
 * STRESS TEST 1 — Connection Storm
 *
 * Measures how many simultaneous socket connections the server can accept
 * before connections start timing out or getting refused.
 *
 * Usage:
 *   node stress-test/01-connections.mjs [totalClients] [batchSize]
 *
 * Example:
 *   node stress-test/01-connections.mjs 500 50
 */
import { connectSocket, randomWallet, sleep, Metrics, MemorySampler } from "./helpers.mjs";

const TOTAL_CLIENTS = parseInt(process.argv[2] || "200", 10);
const BATCH_SIZE = parseInt(process.argv[3] || "25", 10);
const CONNECT_TIMEOUT = 15000;

async function run() {
  const metrics = new Metrics(`Connection Storm (${TOTAL_CLIENTS} clients, batch=${BATCH_SIZE})`);
  const memory = new MemorySampler(1000);
  const sockets = [];

  console.log(`[CONN STORM] Connecting ${TOTAL_CLIENTS} clients in batches of ${BATCH_SIZE}...`);
  metrics.start();
  memory.start();

  for (let batch = 0; batch < TOTAL_CLIENTS; batch += BATCH_SIZE) {
    const batchEnd = Math.min(batch + BATCH_SIZE, TOTAL_CLIENTS);
    const promises = [];

    for (let i = batch; i < batchEnd; i++) {
      const wallet = randomWallet();
      const t0 = Date.now();

      promises.push(
        connectSocket(wallet, { timeout: CONNECT_TIMEOUT })
          .then((socket) => {
            const elapsed = Date.now() - t0;
            metrics.timing("connect", elapsed);
            metrics.inc("connected");
            sockets.push(socket);
          })
          .catch((err) => {
            metrics.error(`Connect failed (client #${i}): ${err.message}`);
            metrics.inc("connect_failed");
          })
      );
    }

    await Promise.all(promises);
    const connected = metrics.counters.connected || 0;
    const failed = metrics.counters.connect_failed || 0;
    console.log(`  [batch] ${connected} connected / ${failed} failed (total attempted: ${batchEnd})`);

    // Small gap between batches to avoid TLS handshake stampede
    await sleep(100);
  }

  // Hold connections open for a few seconds to stress the server
  console.log(`[CONN STORM] Holding ${sockets.length} connections open for 5s...`);
  await sleep(5000);

  // Measure ping latency under load
  console.log(`[CONN STORM] Pinging all connected sockets...`);
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
        metrics.timing("ping_rtt", Date.now() - t0);
        metrics.inc("pings_ok");
        resolve();
      });
    });
  });
  await Promise.all(pingPromises);

  // Disconnect all
  console.log(`[CONN STORM] Disconnecting...`);
  for (const s of sockets) {
    s.disconnect();
  }
  await sleep(1000);

  metrics.stop();
  memory.stop();
  memory.report();
  const result = metrics.report();

  // Exit with error code if more than 10% failed
  const failRate = (metrics.counters.connect_failed || 0) / TOTAL_CLIENTS;
  if (failRate > 0.1) {
    console.log(`\n❌ FAIL: ${(failRate * 100).toFixed(1)}% of connections failed`);
    process.exit(1);
  } else {
    console.log(`\n✅ PASS: ${metrics.counters.connected} / ${TOTAL_CLIENTS} connected successfully`);
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
