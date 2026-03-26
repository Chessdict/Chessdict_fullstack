import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REDIS_CONNECT_TIMEOUT_MS = 5000;

const redisOptions = {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    return delay;
  },
  lazyConnect: true,
  connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
  // Avoid queuing commands behind a dead Redis connection; callers fall back instead.
  enableOfflineQueue: false,
};

/** Main Redis client for general use (caching, pub/sub subscriber, etc.) */
export const redis = new Redis(REDIS_URL, redisOptions);

/** Dedicated pub client for Socket.IO adapter */
export const redisPub = new Redis(REDIS_URL, redisOptions);

/** Dedicated sub client for Socket.IO adapter */
export const redisSub = new Redis(REDIS_URL, redisOptions);

redis.on("error", (err) => console.error("[REDIS] Client error:", err.message));
redisPub.on("error", (err) => console.error("[REDIS] Pub error:", err.message));
redisSub.on("error", (err) => console.error("[REDIS] Sub error:", err.message));

redis.on("ready", () => console.log("[REDIS] Main client ready"));
redisPub.on("ready", () => console.log("[REDIS] Pub client ready"));
redisSub.on("ready", () => console.log("[REDIS] Sub client ready"));

for (const [label, client] of [
  ["Main", redis],
  ["Pub", redisPub],
  ["Sub", redisSub],
]) {
  client.on("close", () => console.warn(`[REDIS] ${label} client closed`));
  client.on("end", () => console.warn(`[REDIS] ${label} client ended`));
}

function isClientReady(client) {
  return client.status === "ready";
}

export function isRedisReady() {
  return isClientReady(redis);
}

export function isRedisAdapterReady() {
  return isClientReady(redisPub) && isClientReady(redisSub);
}

async function safeRedisRead(operation, fallback = null) {
  // Keep reads from stalling request/game flows when Redis is temporarily unavailable.
  if (!isRedisReady()) return fallback;
  try {
    return await operation();
  } catch (err) {
    console.error("[REDIS] Read failed:", err.message);
    return fallback;
  }
}

async function safeRedisWrite(operation, fallback = null) {
  // Writes degrade to no-ops so gameplay can continue on the single web instance.
  if (!isRedisReady()) return fallback;
  try {
    return await operation();
  } catch (err) {
    console.error("[REDIS] Write failed:", err.message);
    return fallback;
  }
}

// ─── Game State Helpers ───

const GAME_STATE_PREFIX = "game:state:";
const GAME_STATE_TTL = 60 * 60 * 4; // 4 hours

/**
 * Store game state (FEN + move list) in Redis.
 * @param {string} roomId
 * @param {{ fen: string, moves: Array }} state
 */
export async function setGameState(roomId, state) {
  return safeRedisWrite(() =>
    redis.set(
      `${GAME_STATE_PREFIX}${roomId}`,
      JSON.stringify(state),
      "EX",
      GAME_STATE_TTL
    )
  );
}

/** @returns {{ fen: string, moves: Array } | null} */
export async function getGameState(roomId) {
  return safeRedisRead(async () => {
    const raw = await redis.get(`${GAME_STATE_PREFIX}${roomId}`);
    return raw ? JSON.parse(raw) : null;
  }, null);
}

export async function deleteGameState(roomId) {
  return safeRedisWrite(() => redis.del(`${GAME_STATE_PREFIX}${roomId}`));
}

// ─── User-Socket Mapping ───

const USER_SOCKET_PREFIX = "usersocket:";
const USER_SOCKET_TTL = 60 * 60 * 24; // 24 hours

export async function setUserSocket(walletAddress, socketId) {
  return safeRedisWrite(() =>
    redis.set(
      `${USER_SOCKET_PREFIX}${walletAddress}`,
      socketId,
      "EX",
      USER_SOCKET_TTL
    )
  );
}

export async function getUserSocket(walletAddress) {
  return safeRedisRead(() => redis.get(`${USER_SOCKET_PREFIX}${walletAddress}`), null);
}

export async function deleteUserSocket(walletAddress) {
  return safeRedisWrite(() => redis.del(`${USER_SOCKET_PREFIX}${walletAddress}`));
}

// ─── Active Game Tracking ───

const ACTIVE_GAME_PREFIX = "activegame:";
const ACTIVE_GAME_TTL = 60 * 60 * 4;

/**
 * Track which game a user is currently in.
 * @param {string} walletAddress
 * @param {{ roomId: string, color: string, opponentWallet: string, opponentRating: number, playerRating: number }} data
 */
export async function setUserActiveGame(walletAddress, data) {
  return safeRedisWrite(() =>
    redis.set(
      `${ACTIVE_GAME_PREFIX}${walletAddress}`,
      JSON.stringify(data),
      "EX",
      ACTIVE_GAME_TTL
    )
  );
}

export async function getUserActiveGame(walletAddress) {
  return safeRedisRead(async () => {
    const raw = await redis.get(`${ACTIVE_GAME_PREFIX}${walletAddress}`);
    return raw ? JSON.parse(raw) : null;
  }, null);
}

export async function deleteUserActiveGame(walletAddress) {
  return safeRedisWrite(() => redis.del(`${ACTIVE_GAME_PREFIX}${walletAddress}`));
}

// ─── Recently Completed Games ───

const COMPLETED_GAME_PREFIX = "completed:";

export async function markGameCompleted(roomId, ttlSeconds = 10) {
  return safeRedisWrite(() =>
    redis.set(`${COMPLETED_GAME_PREFIX}${roomId}`, "1", "EX", ttlSeconds)
  );
}

export async function isGameRecentlyCompleted(roomId) {
  return safeRedisRead(async () => {
    const val = await redis.get(`${COMPLETED_GAME_PREFIX}${roomId}`);
    return val === "1";
  }, false);
}

// ─── Game Timer State ───

const GAME_TIMER_PREFIX = "gametimer:";
const GAME_TIMER_TTL = 60 * 60 * 4;

export async function setGameTimer(roomId, timerState) {
  return safeRedisWrite(() =>
    redis.set(
      `${GAME_TIMER_PREFIX}${roomId}`,
      JSON.stringify(timerState),
      "EX",
      GAME_TIMER_TTL
    )
  );
}

export async function getGameTimer(roomId) {
  return safeRedisRead(async () => {
    const raw = await redis.get(`${GAME_TIMER_PREFIX}${roomId}`);
    return raw ? JSON.parse(raw) : null;
  }, null);
}

export async function deleteGameTimer(roomId) {
  return safeRedisWrite(() => redis.del(`${GAME_TIMER_PREFIX}${roomId}`));
}

/**
 * Connect all Redis clients. Call this at server startup.
 */
export async function connectRedis() {
  const connectClient = async (client, label) => {
    if (isClientReady(client)) return true;

    // Fail fast at startup so the web app can continue with in-memory fallbacks.
    const timeout = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} Redis connection timeout after ${REDIS_CONNECT_TIMEOUT_MS}ms`)),
        REDIS_CONNECT_TIMEOUT_MS,
      )
    );

    try {
      await Promise.race([client.connect(), timeout]);
      return isClientReady(client);
    } catch (err) {
      console.error(`[REDIS] ${label} connect failed:`, err.message);
      return false;
    }
  };

  const mainReady = await connectClient(redis, "main");
  const pubReady = await connectClient(redisPub, "pub");
  const subReady = await connectClient(redisSub, "sub");
  const adapterReady = pubReady && subReady;

  if (mainReady) {
    console.log("[REDIS] Main client connected");
  } else {
    console.warn("[REDIS] Main client unavailable; cache helpers will fall back");
  }

  if (adapterReady) {
    console.log("[REDIS] Adapter clients connected");
  } else {
    console.warn("[REDIS] Adapter clients unavailable; Socket.IO will use in-memory adapter");
  }

  return { mainReady, adapterReady };
}
