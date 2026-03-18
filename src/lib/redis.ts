import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const globalForRedis = globalThis as unknown as { redis: Redis };

const redis =
  globalForRedis.redis ??
  new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

redis.on("error", (err) =>
  console.error("[REDIS] Client error:", err.message)
);

export default redis;
