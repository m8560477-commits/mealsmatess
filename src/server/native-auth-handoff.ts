import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";

// One-time handoff between the in-app browser (Chrome Custom Tab) and the app's WebView.
// The Custom Tab and the WebView do not share storage, so a signed-in tab cannot sign the
// WebView in directly. Instead the tab trades its Firebase session for a short-lived,
// single-use code; the app redeems the code (plus the secret `state` it generated) for a
// Firebase custom token. Only the code and state travel through the deep link, never a token.

export const HANDOFF_TTL_SECONDS = 60;
const KEY_PREFIX = "mealmate:native-auth:";
const STATE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface HandoffStore {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Read and delete in one step so a code can only ever be redeemed once. */
  take(key: string): Promise<string | null>;
}

export class HandoffError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 503,
  ) {
    super(message);
    this.name = "HandoffError";
  }
}

export function isValidHandoffState(value: unknown): value is string {
  return typeof value === "string" && STATE_PATTERN.test(value);
}

function hashState(state: string) {
  return createHash("sha256").update(state).digest();
}

function keyFor(code: string) {
  return `${KEY_PREFIX}${createHash("sha256").update(code).digest("hex")}`;
}

export async function issueHandoffCode(store: HandoffStore, customToken: string, state: string) {
  if (!isValidHandoffState(state)) throw new HandoffError("Invalid sign-in request.", 400);
  const code = randomBytes(32).toString("base64url");
  await store.set(
    keyFor(code),
    JSON.stringify({ customToken, stateHash: hashState(state).toString("hex") }),
    HANDOFF_TTL_SECONDS,
  );
  return code;
}

export async function redeemHandoffCode(store: HandoffStore, code: string, state: string) {
  if (!CODE_PATTERN.test(code) || !isValidHandoffState(state)) {
    throw new HandoffError("Invalid sign-in request.", 400);
  }
  const raw = await store.take(keyFor(code));
  if (!raw) throw new HandoffError("This sign-in link has expired. Please try again.", 404);

  let stored: { customToken?: unknown; stateHash?: unknown };
  try {
    stored = JSON.parse(raw) as typeof stored;
  } catch {
    throw new HandoffError("This sign-in link has expired. Please try again.", 404);
  }
  if (typeof stored.customToken !== "string" || typeof stored.stateHash !== "string") {
    throw new HandoffError("This sign-in link has expired. Please try again.", 404);
  }

  const expected = Buffer.from(stored.stateHash, "hex");
  const actual = hashState(state);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    // The code is already consumed above, so a wrong state cannot be retried.
    throw new HandoffError("This sign-in link has expired. Please try again.", 404);
  }
  return stored.customToken;
}

export function createRedisHandoffStore(): HandoffStore {
  const url =
    process.env["UPSTASH_REDIS_REST_URL"]?.trim() || process.env["KV_REST_API_URL"]?.trim();
  const token =
    process.env["UPSTASH_REDIS_REST_TOKEN"]?.trim() || process.env["KV_REST_API_TOKEN"]?.trim();
  if (!url || !token) {
    throw new HandoffError("Sign-up is temporarily unavailable.", 503);
  }
  const redis = new Redis({ url, token });
  return {
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, { ex: ttlSeconds });
    },
    async take(key) {
      const value = await redis.getdel<unknown>(key);
      if (value === null || value === undefined) return null;
      return typeof value === "string" ? value : JSON.stringify(value);
    },
  };
}
