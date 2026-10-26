import { z } from "zod";

export const BILLING_TERMS_VERSION = "2026-10-25";
const date = z.string().datetime({ offset: true }).nullable();
const subscription = z.object({
  expires_date: date,
  purchase_date: date,
  grace_period_expires_date: date.optional(),
  refunded_at: date.optional(),
  unsubscribe_detected_at: date.optional(),
  billing_issues_detected_at: date.optional(),
  is_sandbox: z.boolean(),
  store: z.string(),
  period_type: z.string().optional(),
});
export const subscriberResponse = z.object({
  subscriber: z.object({
    original_app_user_id: z.string(),
    entitlements: z.record(
      z.object({
        product_identifier: z.string(),
        expires_date: date,
        purchase_date: date,
        grace_period_expires_date: date.optional(),
      }),
    ),
    subscriptions: z.record(subscription),
  }),
});
export type BillingPolicy = {
  entitlement: string;
  productIds: string[];
  environment: "PRODUCTION" | "SANDBOX";
};

/** Only independently fetched provider state may reach this function. */
export function verifiedSubscription(
  body: unknown,
  uid: string,
  policy: BillingPolicy,
  now: number,
) {
  const { subscriber } = subscriberResponse.parse(body);
  if (subscriber.original_app_user_id !== uid)
    throw new Error("Restore using the original MealMate account.");
  const entitlement = subscriber.entitlements[policy.entitlement];
  const productId = entitlement?.product_identifier;
  const purchase = productId ? subscriber.subscriptions[productId] : undefined;
  const allowed = !!productId && policy.productIds.includes(productId);
  const storeValid =
    !!purchase && ["play_store", "app_store", "stripe", "promotional"].includes(purchase.store);
  const environmentMatches = purchase?.is_sandbox === (policy.environment === "SANDBOX");
  const expires = entitlement?.expires_date ? Date.parse(entitlement.expires_date) : NaN;
  const purchaseExpires = purchase?.expires_date ? Date.parse(purchase.expires_date) : NaN;
  const grace =
    entitlement?.grace_period_expires_date && purchase?.grace_period_expires_date
      ? Math.min(
          Date.parse(entitlement.grace_period_expires_date),
          Date.parse(purchase.grace_period_expires_date),
        )
      : NaN;
  const regularEnd = Math.min(expires, purchaseExpires);
  const end =
    Number.isFinite(regularEnd) && Number.isFinite(grace)
      ? Math.max(regularEnd, grace)
      : regularEnd;
  const verified =
    allowed &&
    storeValid &&
    environmentMatches &&
    !purchase?.refunded_at &&
    Number.isFinite(end) &&
    end > now;
  // Sandbox state is recorded for diagnosis but never grants live app access.
  const active = verified && policy.environment === "PRODUCTION";
  const start = purchase?.purchase_date ?? null;
  return {
    source: "revenuecat",
    rc_app_user_id: uid,
    user_id: uid,
    product_id: productId ?? null,
    store: purchase?.store === "promotional" ? "promo" : (purchase?.store ?? "play_store"),
    environment: policy.environment,
    status: active
      ? regularEnd <= now
        ? "in_grace"
        : purchase?.period_type === "trial"
          ? "trialing"
          : "active"
      : "expired",
    tier:
      start && Number.isFinite(regularEnd) && regularEnd - Date.parse(start) > 300 * 86400000
        ? "annual"
        : "monthly",
    period_start: start,
    period_end: Number.isFinite(end) ? new Date(end).toISOString() : new Date(now).toISOString(),
    trial_end:
      purchase?.period_type === "trial" && Number.isFinite(end)
        ? new Date(end).toISOString()
        : null,
    auto_renew:
      active && !purchase?.unsubscribe_detected_at && !purchase?.billing_issues_detected_at,
    is_manual: false,
    sandbox_verified: verified && policy.environment === "SANDBOX",
  };
}

export function activeGrant(row: Record<string, unknown>, now = Date.now()) {
  if (!["active", "trialing", "in_grace"].includes(String(row.status))) return false;
  if (row.environment === "SANDBOX") return false;
  return (
    row.tier === "lifetime" || row.period_end == null || Date.parse(String(row.period_end)) > now
  );
}
