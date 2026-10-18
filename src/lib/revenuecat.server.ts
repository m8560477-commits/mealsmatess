import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getFirebaseServerServices } from "@/server/firebase-admin";

const DateValue = z.string().datetime({ offset: true }).nullable().optional();
const SubscriberSchema = z.object({
  subscriber: z.object({
    entitlements: z.record(
      z.object({
        product_identifier: z.string(),
        expires_date: DateValue,
        purchase_date: DateValue,
        grace_period_expires_date: DateValue,
      }),
    ),
    subscriptions: z.record(
      z.object({
        expires_date: DateValue,
        grace_period_expires_date: DateValue,
        unsubscribe_detected_at: DateValue,
        billing_issues_detected_at: DateValue,
        period_type: z.string().optional(),
        is_sandbox: z.boolean().optional(),
        store: z.string().optional(),
      }),
    ),
    management_url: z.string().url().nullable().optional(),
  }),
});
export type BillingSnapshot = {
  user_id: string;
  product_id: string | null;
  is_active: boolean;
  is_trial: boolean;
  is_family: boolean;
  expires_at: string | null;
  auto_renew: boolean;
  verified_at: string;
  management_url: string | null;
  store: string | null;
  status: string;
};
export function mapRevenueCatSubscriber(
  raw: unknown,
  userId: string,
  now = Date.now(),
): BillingSnapshot {
  const { subscriber } = SubscriberSchema.parse(raw);
  const entitlement =
    subscriber.entitlements[process.env["REVENUECAT_PREMIUM_ENTITLEMENT_ID"] || "premium"];
  const product = entitlement?.product_identifier;
  const sub = product ? subscriber.subscriptions[product] : undefined;
  const expiries = [
    sub?.grace_period_expires_date,
    entitlement?.grace_period_expires_date,
    entitlement?.expires_date,
  ].filter((value): value is string => !!value);
  const expiresAt = expiries.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  const sandboxAllowed = process.env["REVENUECAT_ALLOW_SANDBOX"] === "true";
  // Subscription products must carry an explicit provider-confirmed expiry.
  const active =
    !!entitlement &&
    !!sub &&
    (sandboxAllowed || sub.is_sandbox !== true) &&
    !!expiresAt &&
    Date.parse(expiresAt) > now;
  const familyProducts = (process.env["REVENUECAT_FAMILY_PRODUCT_IDS"] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return {
    user_id: userId,
    product_id: product ?? null,
    is_active: active,
    is_trial: active && sub?.period_type?.toLowerCase() === "trial",
    is_family: !!product && familyProducts.includes(product),
    expires_at: expiresAt,
    auto_renew: !!sub && !sub.unsubscribe_detected_at,
    verified_at: new Date(now).toISOString(),
    management_url: subscriber.management_url ?? null,
    store: sub?.store ?? null,
    status: active ? (sub?.billing_issues_detected_at ? "in_grace" : "active") : "expired",
  };
}

export async function fetchRevenueCatSubscriber(userId: string): Promise<BillingSnapshot> {
  const key = process.env["REVENUECAT_SECRET_API_KEY"];
  if (!key) throw new Error("RevenueCat server verification is not configured.");
  const started = Date.now();
  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!response.ok) throw new Error("Subscription provider is temporarily unavailable.");
  return mapRevenueCatSubscriber(await response.json(), userId, started);
}

export async function syncRevenueCat(userId: string) {
  const state = await fetchRevenueCatSubscriber(userId);
  const { db } = getFirebaseServerServices();
  return db.runTransaction(async (tx) => {
    const ref = db.collection("billing_customers").doc(userId);
    const old = await tx.get(ref);
    if (Date.parse(old.data()?.verified_at ?? "") > Date.parse(state.verified_at))
      return old.data() as BillingSnapshot;
    tx.set(ref, state);
    tx.set(
      db.collection("subscriptions").doc(`revenuecat_${userId}`),
      {
        user_id: userId,
        rc_app_user_id: userId,
        product_id: state.product_id,
        status: state.is_trial ? "trialing" : state.status,
        tier: state.is_family ? "family" : "premium",
        period_end: state.expires_at,
        trial_end: state.is_trial ? state.expires_at : null,
        auto_renew: state.auto_renew,
        is_manual: false,
        store: state.store,
        verified_at: state.verified_at,
        updated_at: state.verified_at,
      },
      { merge: true },
    );
    return state;
  });
}

/** Verify both configured bearer authorization and RevenueCat's raw-body HMAC. */
export function validRevenueCatSignature(
  raw: string,
  authorization: string,
  signature: string,
  now = Date.now(),
) {
  const bearer = process.env["REVENUECAT_WEBHOOK_SECRET"];
  const signing = process.env["REVENUECAT_WEBHOOK_SIGNING_SECRET"];
  if (!bearer || !signing) return false;
  const actual = Buffer.from(authorization.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(bearer);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  const parts = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=")));
  if (!/^\d+$/.test(parts.t ?? "") || !/^[a-f0-9]{64}$/i.test(parts.v1 ?? "")) return false;
  if (Math.abs(now / 1000 - Number(parts.t)) > 300) return false;
  const mac = createHmac("sha256", signing).update(`${parts.t}.${raw}`).digest();
  return timingSafeEqual(mac, Buffer.from(parts.v1!, "hex"));
}
