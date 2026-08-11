/**
 * STRESS TEST 3 — Rapid-Fire Event Flood
 *
 * Connects a small number of sockets, then floods the server with
 * events as fast as possible to test:
 *   - Event loop saturation
 *   - Whether the server stays responsive under spam
 *   - Whether other sockets can still ping while one floods
 *
 * Usage:
 *   node stress-test/03-event-flood.mjs [flooders] [eventsPerFlooder] [innocentBystanders]
 *
 * Example:
 *   node stress-test/03-event-flood.mjs 10 2000 5
 */
import {
  connectSocket,
  randomWallet,
  sleep,
  Metrics,
  MemorySampler,
} from "./helpers.mjs";

const NUM_FLOODERS = parseInt(process.argv[2] || "10", 10);
const EVENTS_PER_FLOODER = parseInt(process.argv[3] || "2000", 10);
const NUM_BYSTANDERS = parseInt(process.argv[4] || "5", 10);

async function run() {
  const metrics = new Metrics(
    `Event Flood (${NUM_FLOODERS} flooders × ${EVENTS_PER_FLOODER} events, ${NUM_BYSTANDERS} bystanders)`
  );
  const memory = new MemorySampler(1000);

  console.log(`[FLOOD] Connecting ${NUM_FLOODERS} flooders + ${NUM_BYSTANDERS} bystanders...`);
  metrics.start();
  memory.start();

  const flooders = [];
  const bystanders = [];

  for (let i = 0; i < NUM_FLOODERS; i++) {
    try {
      const s = await connectSocket(randomWallet());
      flooders.push(s);
    } catch (err) {
      metrics.error(`Flooder #${i} connect failed: ${err.message}`);
    }
  }

  for (let i = 0; i < NUM_BYSTANDERS; i++) {
    try {
      const s = await connectSocket(randomWallet());
      bystanders.push(s);
    } catch (err) {
      metrics.error(`Bystander #${i} connect failed: ${err.message}`);
    }
  }

  console.log(`[FLOOD] Connected ${flooders.length} flooders, ${bystanders.length} bystanders`);

  // Pre-flood: measure bystander baseline ping
  console.log(`[FLOOD] Baseline ping measurement...`);
  for (const socket of bystanders) {
    const t0 = Date.now();
    socket.emit("ping", { timestamp: t0 });
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        metrics.inc("baseline_ping_timeout");
        resolve();
      }, 3000);
      socket.once("pong", () => {
        clearTimeout(timer);
        metrics.timing("baseline_ping", Date.now() - t0);
        resolve();
      });
    });
  }

  // Fire the flood
  console.log(`[FLOOD] Firing ${NUM_FLOODERS * EVENTS_PER_FLOODER} total events...`);
  const floodStart = Date.now();

  const floodPromises = flooders.map(async (socket) => {
    for (let i = 0; i < EVENTS_PER_FLOODER; i++) {
      // Send a mix of events that the server actually handles
      switch (i % 5) {
        case 0:
          socket.emit("ping", { timestamp: Date.now() });
          break;
        case 1:
          socket.emit("checkStatus", { userIds: [randomWallet(), randomWallet()] });
          break;
        case 2:
          socket.emit("joinQueue", { userId: socket.io.opts.query?.userId, timeControl: 3 });
          break;
        case 3:
          socket.emit("leaveQueue");
          break;
        case 4:
          socket.emit("joinSpectatorRoom", { roomId: "00000000-0000-0000-0000-000000000000" });
          break;
      }
      metrics.inc("events_sent");

      // Yield to event loop every 100 events
      if (i % 100 === 99) await sleep(0);
    }
  });

  await Promise.all(floodPromises);
  const floodDuration = Date.now() - floodStart;
  console.log(`[FLOOD] Flood completed in ${floodDuration}ms (${((NUM_FLOODERS * EVENTS_PER_FLOODER) / (floodDuration / 1000)).toFixed(0)} events/sec)`);
  metrics.inc("flood_duration_ms", floodDuration);

  // Post-flood: measure bystander ping to see if server is still responsive
  console.log(`[FLOOD] Post-flood ping measurement...`);
  await sleep(500); // let the server drain a bit

  for (const socket of bystanders) {
    const t0 = Date.now();
    socket.emit("ping", { timestamp: t0 });
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        metrics.inc("postflood_ping_timeout");
        resolve();
      }, 5000);
      socket.once("pong", () => {
        clearTimeout(timer);
        metrics.timing("postflood_ping", Date.now() - t0);
        resolve();
      });
    });
  }

  // Disconnect all
  for (const s of [...flooders, ...bystanders]) s.disconnect();
  await sleep(1000);

  metrics.stop();
  memory.stop();
  memory.report();
  metrics.report();

  // Check if bystanders could still get responses
  const timedOutPost = metrics.counters.postflood_ping_timeout || 0;
  if (timedOutPost > bystanders.length * 0.5) {
    console.log(`\n❌ FAIL: Server unresponsive to bystanders after flood (${timedOutPost}/${bystanders.length} timeouts)`);
    process.exit(1);
  } else {
    console.log(`\n✅ PASS: Server remained responsive (${bystanders.length - timedOutPost}/${bystanders.length} bystanders got pong)`);
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
