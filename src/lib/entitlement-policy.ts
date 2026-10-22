import { z } from "zod";
const entitlement = z.object({
  expires_date: z.string().nullable(),
  product_identifier: z.string(),
  purchase_date: z.string().optional(),
});
const subscription = z.object({
  period_type: z.string().optional(),
  grace_period_expires_date: z.string().nullable().optional(),
  unsubscribe_detected_at: z.string().nullable().optional(),
  store: z.string().optional(),
});
export const subscriberSchema = z.object({
  subscriber: z.object({
    entitlements: z.record(entitlement),
    subscriptions: z.record(subscription),
  }),
});
export function revenueCatAccess(payload: unknown, expected: string, now = Date.now()) {
  const { subscriber } = subscriberSchema.parse(payload);
  const entry = subscriber.entitlements[expected];
  const sub = entry ? subscriber.subscriptions[entry.product_identifier] : undefined;
  const expiration = entry?.expires_date ? Date.parse(entry.expires_date) : null;
  const grace = sub?.grace_period_expires_date ? Date.parse(sub.grace_period_expires_date) : null;
  const end = Math.max(expiration ?? 0, Number.isFinite(grace) ? grace! : 0);
  const active = !!entry && (entry.expires_date === null || (Number.isFinite(end) && end > now));
  return {
    isPremium: active,
    tier: active ? "premium" : "free",
    status: active
      ? sub?.period_type === "trial"
        ? "trialing"
        : grace && grace > now
          ? "in_grace"
          : "active"
      : "expired",
    trialActive: active && sub?.period_type === "trial",
    periodEnd: end > 0 && Number.isFinite(end) ? new Date(end).toISOString() : null,
    trialEnd:
      sub?.period_type === "trial" && expiration && Number.isFinite(expiration)
        ? new Date(expiration).toISOString()
        : null,
    store: sub?.store ?? null,
    autoRenew: !!sub && !sub.unsubscribe_detected_at,
    isManual: false,
  };
}
export function manualGrantActive(value: Record<string, unknown>, now = Date.now()) {
  return (
    value.revoked !== true &&
    typeof value.expiresAt === "string" &&
    Date.parse(value.expiresAt) > now
  );
}
