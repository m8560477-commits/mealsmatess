import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getFirebaseServerServices } from "@/server/firebase-admin";
import {
  fetchRevenueCatSubscriber,
  validRevenueCatSignature,
  type BillingSnapshot,
} from "@/lib/revenuecat.server";

const EventSchema = z.object({
  event: z.object({
    id: z.string().min(1).max(200),
    type: z.string().min(1).max(80),
    price: z.number().finite().optional(),
    price_in_purchased_currency: z.number().finite().optional(),
    currency: z.string().length(3).optional(),
    environment: z.string().optional(),
    is_trial_conversion: z.boolean().optional(),
    app_user_id: z.string().min(1).max(128).optional(),
    transferred_from: z.array(z.string().min(1).max(128)).max(20).optional(),
    transferred_to: z.array(z.string().min(1).max(128)).max(20).optional(),
  }),
});

export async function handleRevenueCatWebhook(request: Request) {
  const raw = await request.text();
  if (raw.length > 128000) return new Response("Payload too large", { status: 413 });
  if (
    !validRevenueCatSignature(
      raw,
      request.headers.get("authorization") ?? "",
      request.headers.get("x-revenuecat-webhook-signature") ?? "",
    )
  )
    return new Response("Unauthorized", { status: 401 });
  let event: z.infer<typeof EventSchema>["event"];
  try {
    event = EventSchema.parse(JSON.parse(raw)).event;
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }
  if (event.type === "TEST") return new Response("ok");
  const { db, auth } = getFirebaseServerServices();
  const { createHash } = await import("node:crypto");
  const eventRef = db
    .collection("subscription_events")
    .doc(`rc_${createHash("sha256").update(event.id).digest("hex")}`);
  if ((await eventRef.get()).exists) return new Response("Duplicate");
  const userIds = [
    ...new Set(
      [
        event.app_user_id,
        ...(event.transferred_from ?? []),
        ...(event.transferred_to ?? []),
      ].filter((id): id is string => !!id),
    ),
  ];
  if (!userIds.length) return new Response("Missing customer", { status: 400 });
  try {
    const verified: BillingSnapshot[] = [];
    for (const userId of userIds) {
      try {
        await auth.getUser(userId);
      } catch (error) {
        if ((error as { code?: string }).code === "auth/user-not-found") continue;
        throw error;
      }
      verified.push(await fetchRevenueCatSubscriber(userId));
    }
    await db.runTransaction(async (tx) => {
      if ((await tx.get(eventRef)).exists) return;
      const previous = await Promise.all(
        verified.map((state) => tx.get(db.collection("billing_customers").doc(state.user_id))),
      );
      const purchaser = verified.find((state) => state.user_id === event.app_user_id);
      const realPayment =
        purchaser?.is_active &&
        !purchaser.is_trial &&
        event.environment === "PRODUCTION" &&
        (event.price ?? event.price_in_purchased_currency ?? 0) > 0;
      const referrals =
        realPayment && ["INITIAL_PURCHASE", "RENEWAL", "TRIAL_CONVERTED"].includes(event.type)
          ? await tx.get(
              db
                .collection("referrals")
                .where("referred_id", "==", event.app_user_id!)
                .where("status", "==", "pending"),
            )
          : null;
      verified.forEach((state, index) => {
        if (Date.parse(previous[index]?.data()?.verified_at ?? "") > Date.parse(state.verified_at))
          return;
        tx.set(db.collection("billing_customers").doc(state.user_id), state);
        tx.set(
          db.collection("subscriptions").doc(`revenuecat_${state.user_id}`),
          {
            user_id: state.user_id,
            product_id: state.product_id,
            status: state.is_trial ? "trialing" : state.status,
            tier: state.is_family ? "family" : "premium",
            period_end: state.expires_at,
            auto_renew: state.auto_renew,
            is_manual: false,
            store: state.store,
            verified_at: state.verified_at,
            updated_at: state.verified_at,
          },
          { merge: true },
        );
      });
      const now = new Date().toISOString();
      if (
        purchaser &&
        event.environment === "PRODUCTION" &&
        ["INITIAL_PURCHASE", "RENEWAL", "TRIAL_CONVERTED", "REFUND"].includes(event.type)
      ) {
        const sign = event.type === "REFUND" ? -1 : 1;
        tx.set(db.collection("payments").doc(eventRef.id), {
          user_id: purchaser.user_id,
          subscription_id: `revenuecat_${purchaser.user_id}`,
          rc_event_id: event.id,
          amount_usd: event.price == null ? null : sign * Math.abs(event.price),
          amount_original:
            event.price_in_purchased_currency == null
              ? null
              : sign * Math.abs(event.price_in_purchased_currency),
          currency: event.currency ?? null,
          kind:
            event.type === "REFUND"
              ? "refund"
              : event.is_trial_conversion
                ? "trial_conversion"
                : event.type === "RENEWAL"
                  ? "renewal"
                  : "initial",
          occurred_at: now,
        });
      }
      // One independent reward per referral: never mutate the paid subscription.
      const referral = referrals?.docs[0];
      if (referral) {
        const row = referral.data();
        const days = Math.min(365, Math.max(0, Number(row.reward_days) || 0));
        for (const uid of [row.referrer_id, row.referred_id])
          if (typeof uid === "string" && days > 0)
            tx.set(db.collection("legacy_premium_access").doc(`referral_${referral.id}_${uid}`), {
              user_id: uid,
              tier: "promo",
              status: "active",
              store: "promo",
              period_end: new Date(Date.now() + days * 86400000).toISOString(),
              created_at: now,
            });
        tx.update(referral.ref, { status: "rewarded", rewarded_at: now });
      }
      tx.set(eventRef, {
        rc_event_id: event.id,
        event_type: event.type,
        source: "revenuecat",
        user_ids: verified.map((state) => state.user_id),
        processed: true,
        created_at: new Date().toISOString(),
      });
    });
    return new Response("ok");
  } catch {
    return new Response("Subscription verification unavailable; retry delivery.", { status: 503 });
  }
}
export const Route = createFileRoute("/api/public/webhooks/revenuecat")({
  server: { handlers: { POST: ({ request }) => handleRevenueCatWebhook(request) } },
});
