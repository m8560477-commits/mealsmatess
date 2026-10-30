import { randomBytes, createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/server/firebase-admin";

export const ENTITLEMENT = "premium";
export const OFFERING = "default";
const SESSION_DAYS = 90;
const LEASE_MS = 5 * 60_000;
export type PremiumAccess = {
  isPremium: boolean;
  tier: string;
  status: string;
  trialActive: boolean;
  periodEnd: string | null;
  trialEnd: string | null;
  store: string | null;
  autoRenew: boolean;
  isManual: boolean;
  verifiedUntil: number;
};
const denied = (): PremiumAccess => ({
  isPremium: false,
  tier: "free",
  status: "expired",
  trialActive: false,
  periodEnd: null,
  trialEnd: null,
  store: null,
  autoRenew: false,
  isManual: false,
  verifiedUntil: 0,
});
type Subscriber = {
  entitlements?: Record<
    string,
    {
      expires_date?: string | null;
      purchase_date?: string;
      product_identifier?: string;
      grace_period_expires_date?: string | null;
    }
  >;
  subscriptions?: Record<
    string,
    {
      period_type?: string;
      store?: string;
      is_sandbox?: boolean;
      expires_date?: string | null;
      refunded_at?: string | null;
      unsubscribe_detected_at?: string | null;
      grace_period_expires_date?: string | null;
    }
  >;
  non_subscriptions?: Record<
    string,
    { is_sandbox?: boolean; store?: string; purchase_date?: string; refunded_at?: string | null }[]
  >;
};

/** Only the server's authenticated RevenueCat response is accepted as purchase evidence. */
export function parseRevenueCatAccess(
  subscriber: Subscriber,
  now = Date.now(),
  allowSandbox = false,
): PremiumAccess {
  const entitlement = subscriber.entitlements?.[ENTITLEMENT];
  if (
    !entitlement?.product_identifier ||
    typeof entitlement.purchase_date !== "string" ||
    Date.parse(entitlement.purchase_date) > now ||
    !Number.isFinite(Date.parse(entitlement.purchase_date))
  )
    return denied();
  const product = entitlement.product_identifier;
  const subscription = subscriber.subscriptions?.[product];
  const supportedStores = new Set([
    "play_store",
    "app_store",
    "stripe",
    "promotional",
    "rc_billing",
    "paddle",
  ]);
  if (!subscription && entitlement.expires_date === null) {
    const purchase = subscriber.non_subscriptions?.[product]?.find((transaction) => {
      const purchasedAt = Date.parse(transaction.purchase_date ?? "");
      return (
        typeof transaction.store === "string" &&
        supportedStores.has(transaction.store.toLowerCase()) &&
        typeof transaction.is_sandbox === "boolean" &&
        (allowSandbox || !transaction.is_sandbox) &&
        transaction.refunded_at == null &&
        Number.isFinite(purchasedAt) &&
        purchasedAt <= now
      );
    });
    if (!purchase) return denied();
    return {
      isPremium: true,
      tier: product,
      status: "active",
      trialActive: false,
      periodEnd: null,
      trialEnd: null,
      store: purchase.store ?? null,
      autoRenew: false,
      isManual: false,
      verifiedUntil: now + LEASE_MS,
    };
  }
  if (
    !subscription ||
    typeof subscription.store !== "string" ||
    !supportedStores.has(subscription.store.toLowerCase()) ||
    typeof subscription.is_sandbox !== "boolean" ||
    (!allowSandbox && subscription.is_sandbox) ||
    subscription.refunded_at != null
  )
    return denied();

  // Both the entitlement and its underlying store transaction must still be valid.
  const expiry = (value: string | null | undefined) =>
    value === null ? Infinity : typeof value === "string" ? Date.parse(value) : NaN;
  const entitlementEnd = expiry(entitlement.expires_date);
  const subscriptionEnd = expiry(subscription.expires_date);
  if (Number.isNaN(entitlementEnd) || Number.isNaN(subscriptionEnd)) return denied();
  const regularEnd = Math.min(entitlementEnd, subscriptionEnd);
  const entitlementGrace = Date.parse(entitlement.grace_period_expires_date ?? "");
  const subscriptionGrace = Date.parse(subscription.grace_period_expires_date ?? "");
  const grace =
    Number.isFinite(entitlementGrace) && Number.isFinite(subscriptionGrace)
      ? Math.min(entitlementGrace, subscriptionGrace)
      : 0;
  const effectiveEnd = Math.max(regularEnd, grace);
  if (!(effectiveEnd > now)) return denied();
  const trial = subscription?.period_type?.toLowerCase() === "trial";
  return {
    isPremium: true,
    tier: product,
    status: trial ? "trialing" : "active",
    trialActive: trial,
    periodEnd: Number.isFinite(effectiveEnd) ? new Date(effectiveEnd).toISOString() : null,
    trialEnd: trial && Number.isFinite(effectiveEnd) ? new Date(effectiveEnd).toISOString() : null,
    store: subscription?.store ?? null,
    autoRenew: !subscription?.unsubscribe_detected_at,
    isManual: false,
    verifiedUntil: Math.min(now + LEASE_MS, effectiveEnd),
  };
}

export async function verifyRevenueCatCustomer(customerId: string): Promise<PremiumAccess> {
  const key = process.env["REVENUECAT_SECRET_API_KEY"];
  if (!key)
    throw new Error("Subscription verification is temporarily unavailable. Please try again.");
  // Overrides are for synthetic local verification only, never production traffic.
  const production =
    process.env["VERCEL_ENV"] === "production" ||
    (process.env["NODE_ENV"] === "production" &&
      !["preview", "development"].includes(process.env["VERCEL_ENV"] ?? ""));
  const base =
    (!production && process.env["REVENUECAT_API_BASE_URL"]) || "https://api.revenuecat.com/v1";
  const response = await fetch(`${base}/subscribers/${encodeURIComponent(customerId)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return denied();
  if (!response.ok)
    throw new Error("Subscription verification is temporarily unavailable. Please try again.");
  const data = (await response.json()) as { subscriber?: Subscriber };
  if (!data.subscriber) throw new Error("The subscription service returned an invalid response.");
  return parseRevenueCatAccess(
    data.subscriber,
    Date.now(),
    !production && process.env["REVENUECAT_ALLOW_SANDBOX"] === "true",
  );
}

/**
 * Billing claim cookies must only be used by first-party traffic.
 * Accept same-origin and same-site requests; also allow `none` when Origin matches
 * (typed navigations / some mobile webviews) so paywall session creation is not blocked.
 */
export function assertBillingOrigin(request: Request) {
  const site = (request.headers.get("sec-fetch-site") ?? "").toLowerCase();
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;

  if (site === "cross-site") {
    throw new Response("Forbidden", { status: 403 });
  }
  if (site === "same-origin" || site === "same-site") return;
  // site is "none" or missing — require Origin match when present
  if (origin && origin !== requestOrigin) {
    throw new Response("Forbidden", { status: 403 });
  }
}

const sessionId = (token: string) => createHash("sha256").update(token).digest("hex");
function sessionRef(token: string) {
  return getFirebaseAdminFirestore().collection("billing_sessions").doc(sessionId(token));
}
export async function readPurchaseSession(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const snapshot = await sessionRef(token).get();
  const data = snapshot.data();
  if (!data || !Number.isFinite(Number(data.expiresAt)) || Number(data.expiresAt) <= Date.now())
    return null;
  return { customerId: String(data.customerId), owner: data.owner ? String(data.owner) : null };
}
export async function purchaseIdentity(token?: string, userId?: string) {
  const db = getFirebaseAdminFirestore();
  if (userId) {
    const link = await db.collection("billing_links").doc(userId).get();
    return { customerId: String(link.data()?.customerId ?? userId), token: null };
  }
  const current = await readPurchaseSession(token);
  if (current && !current.owner) return { customerId: current.customerId, token: null };
  const next = randomBytes(32).toString("hex");
  const customerId = `mm_${randomBytes(24).toString("hex")}`;
  await sessionRef(next).set({ customerId, expiresAt: Date.now() + SESSION_DAYS * 86400_000 });
  return { customerId, token: next };
}

export async function verifyPurchaseSession(token?: string) {
  const session = await readPurchaseSession(token);
  if (!session || session.owner) return denied();
  return verifyRevenueCatCustomer(session.customerId);
}

export async function verifyAccountAccess(userId: string, token?: string): Promise<PremiumAccess> {
  const db = getFirebaseAdminFirestore();
  const linkRef = db.collection("billing_links").doc(userId);
  const link = await linkRef.get();
  let access = await verifyRevenueCatCustomer(String(link.data()?.customerId ?? userId));
  if (!access.isPremium && !link.exists && token) {
    const session = await readPurchaseSession(token);
    if (session && (!session.owner || session.owner === userId)) {
      const purchased = await verifyRevenueCatCustomer(session.customerId);
      if (purchased.isPremium) {
        // A checkout identity may belong to exactly one Firebase account, including races.
        await db.runTransaction(async (tx) => {
          const [claim, existing] = await Promise.all([tx.get(sessionRef(token)), tx.get(linkRef)]);
          const data = claim.data();
          if (
            !data ||
            Number(data.expiresAt) <= Date.now() ||
            data.customerId !== session.customerId ||
            (data.owner && data.owner !== userId) ||
            (existing.exists && existing.data()?.customerId !== session.customerId)
          )
            throw new Error(
              "This purchase is already linked to an account. Sign in with that account to restore it.",
            );
          tx.set(sessionRef(token), { owner: userId }, { merge: true });
          tx.set(linkRef, { customerId: session.customerId });
        });
        access = purchased;
      }
    }
  }
  await db
    .collection("premium_access")
    .doc(userId)
    .set({
      valid_until: Timestamp.fromMillis(access.verifiedUntil),
      source: "revenuecat",
      entitlement: ENTITLEMENT,
      });
  return access;
}
export async function requireActivePremium(userId: string) {
  const access = await verifyAccountAccess(userId);
  if (!access.isPremium)
    throw new Response("An active MealMate Premium subscription is required.", { status: 402 });
  return access;
}
