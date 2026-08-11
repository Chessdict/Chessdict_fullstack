/**
 * Shared helpers for the stress test suite.
 */
import { io as ioClient } from "socket.io-client";
import { Chess } from "chess.js";
import { randomBytes } from "node:crypto";

// ─── Configuration ───

export const SERVER_URL = process.env.STRESS_SERVER_URL || "http://localhost:8080";

/** Generate a fake 0x wallet address */
export function randomWallet() {
  return "0x" + randomBytes(20).toString("hex");
}

/** Connect a socket as a given wallet userId */
export function connectSocket(userId, opts = {}) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(SERVER_URL, {
      query: { userId },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      timeout: opts.timeout ?? 10000,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`Socket connect timeout for ${userId}`));
    }, opts.timeout ?? 10000);

    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Wait for a specific event on a socket, with a timeout */
export function waitForEvent(socket, event, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for "${event}" on socket ${socket.id}`));
    }, timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/** Play a random legal move on a Chess instance, return the move + new fen */
export function playRandomMove(chess) {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;
  const move = moves[Math.floor(Math.random() * moves.length)];
  const result = chess.move(move);
  return {
    move: { from: result.from, to: result.to, promotion: result.promotion },
    fen: chess.fen(),
    moveRecord: {
      san: result.san,
      from: result.from,
      to: result.to,
      color: result.color,
      piece: result.piece,
      timestamp: Date.now(),
    },
  };
}

/** Sleep for ms */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Metrics Collector ───

export class Metrics {
  constructor(label) {
    this.label = label;
    this.counters = {};
    this.timings = {};
    this.errors = [];
    this.startTime = null;
    this.endTime = null;
  }

  start() {
    this.startTime = Date.now();
  }

  stop() {
    this.endTime = Date.now();
  }

  inc(name, delta = 1) {
    this.counters[name] = (this.counters[name] || 0) + delta;
  }

  timing(name, ms) {
    if (!this.timings[name]) this.timings[name] = [];
    this.timings[name].push(ms);
  }

  error(msg) {
    this.errors.push({ time: Date.now(), msg });
    this.inc("errors");
  }

  getPercentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  report() {
    const elapsed = ((this.endTime || Date.now()) - this.startTime) / 1000;
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  STRESS TEST REPORT: ${this.label}`);
    console.log(`${"═".repeat(60)}`);
    console.log(`  Duration: ${elapsed.toFixed(1)}s`);
    console.log(`  Counters:`);
    for (const [k, v] of Object.entries(this.counters)) {
      console.log(`    ${k}: ${v}`);
    }
    for (const [name, values] of Object.entries(this.timings)) {
      if (values.length === 0) continue;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      console.log(`  Timing — ${name}:`);
      console.log(`    count: ${values.length}`);
      console.log(`    avg:   ${avg.toFixed(1)}ms`);
      console.log(`    p50:   ${this.getPercentile(values, 50).toFixed(1)}ms`);
      console.log(`    p95:   ${this.getPercentile(values, 95).toFixed(1)}ms`);
      console.log(`    p99:   ${this.getPercentile(values, 99).toFixed(1)}ms`);
      console.log(`    max:   ${Math.max(...values).toFixed(1)}ms`);
    }
    if (this.errors.length > 0) {
      console.log(`  Errors (${this.errors.length}):`);
      const shown = this.errors.slice(0, 10);
      for (const e of shown) {
        console.log(`    - ${e.msg}`);
      }
      if (this.errors.length > 10) {
        console.log(`    ... and ${this.errors.length - 10} more`);
      }
    }
    console.log(`${"═".repeat(60)}\n`);
    return { elapsed, counters: this.counters, timings: this.timings, errorCount: this.errors.length };
  }
}

// ─── Memory Sampler ───

export class MemorySampler {
  constructor(intervalMs = 2000) {
    this.samples = [];
    this.intervalMs = intervalMs;
    this._handle = null;
  }

  start() {
    // Only works when running in the same process as the server.
    // For remote testing, use the /api health endpoint or OS tools.
    this._handle = setInterval(() => {
      if (typeof process.memoryUsage === "function") {
        const mem = process.memoryUsage();
        this.samples.push({
          time: Date.now(),
          rss: mem.rss,
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
        });
      }
    }, this.intervalMs);
  }

  stop() {
    if (this._handle) clearInterval(this._handle);
  }

  report() {
    if (this.samples.length === 0) {
      console.log("  Memory: (no samples — test client process only)");
      return;
    }
    const last = this.samples[this.samples.length - 1];
    const first = this.samples[0];
    const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
    console.log(`  Memory (test client process):`);
    console.log(`    RSS:      ${mb(first.rss)}MB -> ${mb(last.rss)}MB`);
    console.log(`    Heap:     ${mb(first.heapUsed)}MB -> ${mb(last.heapUsed)}MB`);
    console.log(`    Samples:  ${this.samples.length}`);
  }
}
