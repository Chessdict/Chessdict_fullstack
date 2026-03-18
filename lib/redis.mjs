import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/** Main Redis client for general use (caching, pub/sub subscriber, etc.) */
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    return delay;
  },
  lazyConnect: true,
});

/** Dedicated pub client for Socket.IO adapter */
export const redisPub = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

/** Dedicated sub client for Socket.IO adapter */
export const redisSub = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on("error", (err) => console.error("[REDIS] Client error:", err.message));
redisPub.on("error", (err) => console.error("[REDIS] Pub error:", err.message));
redisSub.on("error", (err) => console.error("[REDIS] Sub error:", err.message));

redis.on("connect", () => console.log("[REDIS] Connected"));

// ─── Game State Helpers ───

const GAME_STATE_PREFIX = "game:state:";
const GAME_STATE_TTL = 60 * 60 * 4; // 4 hours

/**
 * Store game state (FEN + move list) in Redis.
 * @param {string} roomId
 * @param {{ fen: string, moves: Array }} state
 */
export async function setGameState(roomId, state) {
  await redis.set(
    `${GAME_STATE_PREFIX}${roomId}`,
    JSON.stringify(state),
    "EX",
    GAME_STATE_TTL
  );
}

/** @returns {{ fen: string, moves: Array } | null} */
export async function getGameState(roomId) {
  const raw = await redis.get(`${GAME_STATE_PREFIX}${roomId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function deleteGameState(roomId) {
  await redis.del(`${GAME_STATE_PREFIX}${roomId}`);
}

// ─── User-Socket Mapping ───

const USER_SOCKET_PREFIX = "usersocket:";
const USER_SOCKET_TTL = 60 * 60 * 24; // 24 hours

export async function setUserSocket(walletAddress, socketId) {
  await redis.set(
    `${USER_SOCKET_PREFIX}${walletAddress}`,
    socketId,
    "EX",
    USER_SOCKET_TTL
  );
}

export async function getUserSocket(walletAddress) {
  return redis.get(`${USER_SOCKET_PREFIX}${walletAddress}`);
}

export async function deleteUserSocket(walletAddress) {
  await redis.del(`${USER_SOCKET_PREFIX}${walletAddress}`);
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
  await redis.set(
    `${ACTIVE_GAME_PREFIX}${walletAddress}`,
    JSON.stringify(data),
    "EX",
    ACTIVE_GAME_TTL
  );
}

export async function getUserActiveGame(walletAddress) {
  const raw = await redis.get(`${ACTIVE_GAME_PREFIX}${walletAddress}`);
  return raw ? JSON.parse(raw) : null;
}

export async function deleteUserActiveGame(walletAddress) {
  await redis.del(`${ACTIVE_GAME_PREFIX}${walletAddress}`);
}

// ─── Recently Completed Games ───

const COMPLETED_GAME_PREFIX = "completed:";

export async function markGameCompleted(roomId, ttlSeconds = 10) {
  await redis.set(`${COMPLETED_GAME_PREFIX}${roomId}`, "1", "EX", ttlSeconds);
}

export async function isGameRecentlyCompleted(roomId) {
  const val = await redis.get(`${COMPLETED_GAME_PREFIX}${roomId}`);
  return val === "1";
}

// ─── Game Timer State ───

const GAME_TIMER_PREFIX = "gametimer:";
const GAME_TIMER_TTL = 60 * 60 * 4;

export async function setGameTimer(roomId, timerState) {
  await redis.set(
    `${GAME_TIMER_PREFIX}${roomId}`,
    JSON.stringify(timerState),
    "EX",
    GAME_TIMER_TTL
  );
}

export async function getGameTimer(roomId) {
  const raw = await redis.get(`${GAME_TIMER_PREFIX}${roomId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function deleteGameTimer(roomId) {
  await redis.del(`${GAME_TIMER_PREFIX}${roomId}`);
}

/**
 * Connect all Redis clients. Call this at server startup.
 */
export async function connectRedis() {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Redis connection timeout after 10s")), 10000)
  );
  await Promise.race([
    Promise.all([redis.connect(), redisPub.connect(), redisSub.connect()]),
    timeout,
  ]);
  console.log("[REDIS] All clients connected");
}
