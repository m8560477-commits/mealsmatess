import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { enforceRateLimit } from "@/lib/security.server";

const limiters = new Map<string, Ratelimit>();

function getLimiter(bucket: string, limit: number) {
  const key = `${bucket}:${limit}`;
  const cached = limiters.get(key);
  if (cached) return cached;

  const limiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(limit, "60s"),
    analytics: false,
    prefix: "mealmate:ai",
  });
  limiters.set(key, limiter);
  return limiter;
}

export async function enforceAiRateLimit(
  bucket: string,
  userId: string,
  maxPerMinute: number,
): Promise<void> {
  const url = process.env["UPSTASH_REDIS_REST_URL"]?.trim();
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"]?.trim();
  if (!url || !token) {
    await enforceRateLimit(bucket, userId, maxPerMinute);
    return;
  }

  try {
    const { success } = await getLimiter(bucket, maxPerMinute).limit(`${bucket}:${userId}`);
    if (!success) {
      throw new Response("Too many requests. Please slow down.", { status: 429 });
    }
  } catch (error) {
    if (error instanceof Response && error.status === 429) throw error;
    console.warn("[AI rate limit] Upstash unavailable; using Firebase fallback.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    await enforceRateLimit(bucket, userId, maxPerMinute);
  }
}
