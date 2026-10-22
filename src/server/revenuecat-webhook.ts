import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getFirebaseAdminFirestore, getFirebaseAdminAuth } from "@/server/firebase-admin";
import { resolveEntitlement } from "@/server/entitlements";
import { createUserNotification, eventDocumentId } from "@/server/user-notifications";
export const revenueCatEventSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  type: z.string().min(1).max(100),
  app_user_id: z
    .string()
    .min(1)
    .max(128)
    .refine((value) => !value.includes("/")),
  product_id: z.string().max(256).nullish(),
  environment: z.enum(["SANDBOX", "PRODUCTION"]),
  entitlement_ids: z.array(z.string()).nullish(),
  price_in_purchased_currency: z.number().finite().nullish(),
  currency: z.string().max(8).nullish(),
  purchased_at_ms: z.number().finite().nullish(),
});
export const SUPPORTED_BILLING_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "TEMPORARY_ENTITLEMENT_GRANT",
  "EXPIRATION",
  "CANCELLATION",
  "REFUND",
  "SUBSCRIPTION_PAUSED",
  "BILLING_ISSUE",
  "TRIAL_STARTED",
  "TRIAL_CONVERTED",
]);
export async function processRevenueCatEvent(raw: unknown) {
  const event = revenueCatEventSchema.parse(raw);
  if (!SUPPORTED_BILLING_EVENTS.has(event.type)) return "Ignored unsupported event";
  const expectedEnvironment = process.env.REVENUECAT_ENVIRONMENT ?? "PRODUCTION";
  if (event.environment !== expectedEnvironment) return "Ignored other billing environment";
  let account;
  try {
    account = await getFirebaseAdminAuth().getUser(event.app_user_id);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found")
      return "Ignored unknown account";
    throw error;
  }
  if (account.disabled) return "Ignored disabled account";
  const db = getFirebaseAdminFirestore();
  const ref = db.collection("subscription_events").doc(eventDocumentId(`revenuecat:${event.id}`));
  const leaseId = randomUUID();
  const claimed = await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.get("processed") === true) return "duplicate";
    if (Number(existing.get("leaseUntil") ?? 0) > Date.now()) return "busy";
    tx.set(
      ref,
      {
        rc_event_id: event.id,
        user_id: event.app_user_id,
        event_type: event.type,
        source: "revenuecat",
        processed: false,
        leaseUntil: Date.now() + 120_000,
        leaseId,
        created_at: existing.get("created_at") ?? new Date().toISOString(),
      },
      { merge: true },
    );
    return "claimed";
  });
  if (claimed === "duplicate") return "Duplicate";
  if (claimed === "busy") throw new Error("Billing event already processing; retry later.");
  try {
    if (!process.env.REVENUECAT_SECRET_API_KEY || !process.env.REVENUECAT_ENTITLEMENT_ID)
      throw new Error("Server subscription verification is not configured.");
    // Never derive access from event order, product-name guesses or client claims.
    const access = await resolveEntitlement(event.app_user_id, true, true);
    const now = new Date().toISOString();
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.get("leaseId") !== leaseId) throw new Error("Billing lease lost.");
      tx.set(
        db.collection("subscriptions").doc(eventDocumentId(`paid:${event.app_user_id}`)),
        {
          id: eventDocumentId(`paid:${event.app_user_id}`),
          user_id: event.app_user_id,
          tier: access.tier,
          status: access.status,
          period_end: access.periodEnd,
          trial_end: access.trialEnd,
          auto_renew: access.autoRenew,
          is_manual: false,
          store: access.store,
          environment: event.environment,
          updated_at: now,
          created_at: now,
        },
        { merge: true },
      );
      if (
        ["INITIAL_PURCHASE", "RENEWAL", "TRIAL_CONVERTED", "REFUND"].includes(event.type) &&
        event.price_in_purchased_currency != null
      ) {
        tx.set(db.collection("payments").doc(eventDocumentId(`payment:${event.id}`)), {
          id: eventDocumentId(`payment:${event.id}`),
          user_id: event.app_user_id,
          rc_event_id: event.id,
          amount:
            event.type === "REFUND"
              ? -Math.abs(event.price_in_purchased_currency)
              : event.price_in_purchased_currency,
          // Do not label another currency as USD in admin revenue metrics.
          amount_usd:
            event.currency === "USD"
              ? event.type === "REFUND"
                ? -Math.abs(event.price_in_purchased_currency)
                : event.price_in_purchased_currency
              : null,
          currency: event.currency ?? null,
          kind:
            event.type === "REFUND" ? "refund" : event.type === "RENEWAL" ? "renewal" : "initial",
          occurred_at: now,
        });
      }
    });
    if (
      access.isPremium &&
      !access.trialActive &&
      ["INITIAL_PURCHASE", "TRIAL_CONVERTED"].includes(event.type) &&
      (event.price_in_purchased_currency ?? 0) > 0
    ) {
      const referrals = await db
        .collection("referrals")
        .where("referred_id", "==", event.app_user_id)
        .where("status", "==", "pending")
        .get();
      for (const referral of referrals.docs)
        await db.runTransaction(async (tx) => {
          const current = await tx.get(referral.ref);
          if (current.get("status") !== "pending") return;
          const owner = current.get("referrer_id");
          const days = Number(current.get("reward_days"));
          if (
            typeof owner !== "string" ||
            !owner ||
            owner.includes("/") ||
            owner === event.app_user_id ||
            !Number.isInteger(days) ||
            days < 1 ||
            days > 365
          )
            return;
          const ids = [owner, event.app_user_id];
          const refs = ids.map((id) =>
            db.collection("subscriptions").doc(eventDocumentId(`referral-grant:${id}`)),
          );
          const previous = await Promise.all(refs.map((r) => tx.get(r)));
          refs.forEach((grant, index) =>
            tx.set(grant, {
              id: grant.id,
              user_id: ids[index],
              tier: "promo",
              status: "active",
              store: "promo",
              is_manual: true,
              period_end: new Date(
                Math.max(
                  Date.now(),
                  Date.parse(String(previous[index].get("period_end") ?? "")) || 0,
                ) +
                  days * 86400000,
              ).toISOString(),
              created_at: now,
            }),
          );
          tx.update(referral.ref, { status: "rewarded", rewarded_at: now });
        });
    }
    await createUserNotification(event.app_user_id, {
      eventId: `revenuecat:${event.id}`,
      category: "account",
      title: "Subscription update",
      body:
        event.type === "CANCELLATION"
          ? "Your billing provider reported that renewal was cancelled. Review your subscription for your current access end date."
          : "Your billing provider reported a subscription update. Review your verified plan status in MealMate.",
      destination: "/premium",
    });
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.get("leaseId") !== leaseId) throw new Error("Billing lease lost.");
      tx.update(ref, { processed: true, completed_at: now, leaseUntil: 0 });
    });
    return "ok";
  } catch (error) {
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.get("leaseId") === leaseId) tx.update(ref, { leaseUntil: 0 });
    });
    throw error;
  }
}
