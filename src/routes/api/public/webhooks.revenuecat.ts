import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
import { getFirebaseAdminFirestore, firebaseAuthUserExists } from "@/server/firebase-admin";
import { refreshRevenueCat, revenueCatConfig } from "@/lib/billing/revenuecat.server";
import { activeGrant } from "@/lib/billing/revenuecat-policy";

const eventSchema = z.object({
  event: z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    type: z.string(),
    app_user_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    product_id: z.string().optional(),
    environment: z.enum(["PRODUCTION", "SANDBOX"]),
    store: z.string().optional(),
    period_type: z.string().optional(),
    price_in_purchased_currency: z.number().finite().nonnegative().optional(),
    currency: z.string().optional(),
    purchased_at_ms: z.number().finite().nonnegative().max(8.64e15).optional(),
  }),
});
const paymentTypes = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "TRIAL_CONVERTED",
  "PRODUCT_CHANGE",
  "REFUND",
]);

export const Route = createFileRoute("/api/public/webhooks/revenuecat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
        if (!secret) return new Response("Not configured", { status: 503 });
        const provided = Buffer.from(
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""),
        );
        const expected = Buffer.from(secret);
        if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
          return new Response("Unauthorized", { status: 401 });
        let body;
        try {
          const payload: unknown = await request.json();
          // Dashboard TEST events contain nullable purchase fields and never grant access.
          // Authenticate above, then acknowledge them without provider/database work.
          if (z.object({ event: z.object({ type: z.literal("TEST") }) }).safeParse(payload).success)
            return new Response("Ignored", { status: 200 });
          body = eventSchema.parse(payload);
        } catch {
          return new Response("Bad payload", { status: 400 });
        }
        const evt = body.event;
        // Test Store and sandbox events never modify live subscriptions/payments/referrals.
        if (
          evt.environment !== "PRODUCTION" ||
          !["PLAY_STORE", "APP_STORE", "MAC_APP_STORE", "STRIPE", "PROMOTIONAL"].includes(
            evt.store ?? "",
          ) ||
          evt.type === "TEST"
        )
          return new Response("Ignored", { status: 200 });
        try {
          const config = revenueCatConfig();
          if (config.environment !== "PRODUCTION") return new Response("Ignored", { status: 200 });
          const db = getFirebaseAdminFirestore();
          const eventRef = db.collection("subscription_events").doc(evt.id);
          const existing = await eventRef.get();
          if (existing.exists && existing.data()?.processed !== false)
            return new Response("Duplicate");
          if (!(await firebaseAuthUserExists(evt.app_user_id)))
            return new Response("Unknown Firebase user", { status: 400 });
          // A webhook triggers a fresh REST verification; delayed events cannot resurrect access.
          const access = await refreshRevenueCat(evt.app_user_id);
          const approvedProduct = !!evt.product_id && config.productIds.includes(evt.product_id);
          await db.runTransaction(async (tx) => {
            const processed = await tx.get(eventRef);
            if (processed.exists && processed.data()?.processed !== false) return;
            const paid = approvedProduct && (evt.price_in_purchased_currency ?? 0) > 0;
            const firstPayment =
              access.active && paid && ["INITIAL_PURCHASE", "TRIAL_CONVERTED"].includes(evt.type);
            const referrals = firstPayment
              ? await tx.get(
                  db
                    .collection("referrals")
                    .where("referred_id", "==", evt.app_user_id)
                    .where("status", "==", "pending")
                    .limit(1),
                )
              : null;
            // Read all reward baselines before any transaction write. Preserve the
            // previous promise of adding days after existing paid/granted access.
            const baselines = new Map<string, number>();
            for (const referral of referrals?.docs ?? []) {
              const referrer = referral.data().referrer_id;
              if (typeof referrer !== "string") continue;
              for (const uid of [referrer, evt.app_user_id]) {
                const grants = await tx.get(
                  db.collection("subscriptions").where("user_id", "==", uid),
                );
                const ends = grants.docs
                  .filter((doc) => activeGrant(doc.data()))
                  .map((doc) => Date.parse(doc.data().period_end))
                  .filter(Number.isFinite);
                baselines.set(uid, Math.max(Date.now(), ...ends));
              }
            }
            const now = new Date().toISOString();
            tx.set(eventRef, {
              id: evt.id,
              user_id: evt.app_user_id,
              rc_event_id: evt.id,
              source: "revenuecat",
              event_type: evt.type,
              payload: evt,
              processed: true,
              completed_at: now,
              created_at: existing.data()?.created_at ?? now,
            });
            if (paid && paymentTypes.has(evt.type)) {
              const amount = (evt.type === "REFUND" ? -1 : 1) * evt.price_in_purchased_currency!;
              tx.set(db.collection("payments").doc(evt.id), {
                id: evt.id,
                user_id: evt.app_user_id,
                rc_event_id: evt.id,
                subscription_id: `revenuecat_${createHash("sha256").update(evt.app_user_id).digest("hex")}`,
                amount_usd: evt.currency === "USD" ? amount : null,
                amount_local: amount,
                currency: evt.currency ?? null,
                kind:
                  evt.type === "REFUND"
                    ? "refund"
                    : evt.type === "RENEWAL"
                      ? "renewal"
                      : evt.type === "TRIAL_CONVERTED"
                        ? "trial_conversion"
                        : "initial",
                occurred_at: evt.purchased_at_ms
                  ? new Date(evt.purchased_at_ms).toISOString()
                  : now,
              });
            }
            for (const referral of referrals?.docs ?? []) {
              const row = referral.data();
              const days = Number(row.reward_days);
              if (
                !Number.isFinite(days) ||
                days <= 0 ||
                days > 365 ||
                typeof row.referrer_id !== "string" ||
                row.referrer_id === evt.app_user_id
              )
                continue;
              for (const uid of [row.referrer_id, evt.app_user_id]) {
                const id = `referral_${createHash("sha256").update(`${referral.id}:${uid}`).digest("hex")}`;
                tx.set(db.collection("subscriptions").doc(id), {
                  id,
                  user_id: uid,
                  source: "referral",
                  tier: "promo",
                  store: "promo",
                  is_manual: true,
                  status: "active",
                  period_start: now,
                  period_end: new Date(
                    (baselines.get(uid) ?? Date.now()) + days * 86400000,
                  ).toISOString(),
                  created_at: now,
                });
              }
              tx.update(referral.ref, { status: "rewarded", rewarded_at: now });
            }
          });
          return new Response("ok");
        } catch (error) {
          console.warn(
            "RevenueCat webhook verification failed",
            error instanceof Error ? error.name : "UnknownError",
          );
          return new Response("Verification unavailable; retry later", { status: 503 });
        }
      },
    },
  },
});
