import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

// RevenueCat webhook receiver.
// Configure in RevenueCat → Integrations → Webhook:
//   URL: https://<your-production-domain>/api/public/webhooks/revenuecat
//   Auth header: `Bearer <REVENUECAT_WEBHOOK_SECRET>`
// RC sends `Authorization: Bearer <secret>` on every request.
// Docs: https://www.revenuecat.com/docs/integrations/webhooks

type RCEvent = {
  event: {
    id: string;
    type: string;
    app_user_id: string;
    original_app_user_id?: string;
    product_id?: string;
    period_type?: string;
    purchased_at_ms?: number;
    expiration_at_ms?: number | null;
    environment?: string;
    store?: string;
    price_in_purchased_currency?: number;
    currency?: string;
    is_trial_conversion?: boolean;
  };
};

const TRIAL_TYPES = new Set(["INITIAL_PURCHASE", "TRIAL_STARTED"]);
const ACTIVATE_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "TRIAL_CONVERTED",
  "TRIAL_STARTED",
  "NON_RENEWING_PURCHASE",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);
const EXPIRE_TYPES = new Set(["EXPIRATION", "CANCELLATION", "REFUND", "SUBSCRIPTION_PAUSED"]);

function tierFromProduct(
  productId: string | undefined,
): "monthly" | "annual" | "lifetime" | "promo" {
  const p = (productId ?? "").toLowerCase();
  if (p.includes("annual") || p.includes("year")) return "annual";
  if (p.includes("lifetime") || p.includes("forever")) return "lifetime";
  if (p.includes("monthly") || p.includes("month")) return "monthly";
  return "monthly";
}

function storeFrom(
  s: string | undefined,
): "app_store" | "play_store" | "stripe" | "promo" | "admin" {
  switch ((s ?? "").toUpperCase()) {
    case "APP_STORE":
    case "MAC_APP_STORE":
      return "app_store";
    case "PLAY_STORE":
      return "play_store";
    case "STRIPE":
      return "stripe";
    case "PROMOTIONAL":
      return "promo";
    default:
      return "app_store";
  }
}

export const Route = createFileRoute("/api/public/webhooks/revenuecat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["REVENUECAT_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 500 });

        const auth = request.headers.get("authorization") ?? "";
        const provided = auth.replace(/^Bearer\s+/i, "");
        const a = Buffer.from(provided);
        const b = Buffer.from(secret);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: RCEvent;
        try {
          body = (await request.json()) as RCEvent;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const evt = body.event;
        if (
          !evt ||
          !evt.id ||
          !evt.type ||
          !evt.app_user_id ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(evt.id)
        ) {
          return new Response("Bad payload", { status: 400 });
        }

        const { firebaseAdmin, firebaseAuthUserExists, getFirebaseAdminFirestore } =
          await import("@/server/firebase-admin");
        let userId = evt.app_user_id;
        if (/^mm_[a-f0-9]{48}$/.test(userId)) {
          const links = await getFirebaseAdminFirestore()
            .collection("billing_links")
            .where("customerId", "==", userId)
            .limit(1)
            .get();
          // Keep the event retryable until checkout is linked to a Firebase account.
          if (links.empty)
            return new Response("Account linking pending", {
              status: 503,
              headers: { "Retry-After": "60" },
            });
          userId = links.docs[0].id;
        }
        if (!(await firebaseAuthUserExists(userId))) {
          return new Response("Unknown Firebase user", { status: 400 });
        }

        const { data: previousEvent } = await firebaseAdmin
          .from("subscription_events")
          .select("id,processed,claimed_at")
          .eq("rc_event_id", evt.id)
          .maybeSingle();
        if (previousEvent && previousEvent.processed !== false) {
          return new Response("Duplicate", { status: 200 });
        }
        if (previousEvent) {
          const claimTime = Date.parse(String(previousEvent.claimed_at ?? ""));
          if (Number.isFinite(claimTime) && Date.now() - claimTime < 120_000) {
            return new Response("Processing", { status: 503 });
          }
          await firebaseAdmin.from("subscription_events").delete().eq("rc_event_id", evt.id);
        }

        const claimedAt = new Date().toISOString();
        const { error: claimError } = await firebaseAdmin.from("subscription_events").insert({
          user_id: userId,
          event_type: evt.type,
          source: "revenuecat",
          rc_event_id: evt.id,
          payload: JSON.parse(JSON.stringify(evt)),
          processed: false,
          claimed_at: claimedAt,
        });
        if (claimError) return new Response("Processing", { status: 503 });
        const tier = tierFromProduct(evt.product_id);
        const store = storeFrom(evt.store);
        const periodEnd = evt.expiration_at_ms
          ? new Date(evt.expiration_at_ms).toISOString()
          : null;
        const purchasedAt = evt.purchased_at_ms
          ? new Date(evt.purchased_at_ms).toISOString()
          : new Date().toISOString();

        // Find or create subscription for this user
        const { data: existing } = await firebaseAdmin
          .from("subscriptions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (ACTIVATE_TYPES.has(evt.type)) {
          const status: "trialing" | "active" =
            TRIAL_TYPES.has(evt.type) && evt.period_type === "TRIAL" ? "trialing" : "active";
          const patch = {
            user_id: userId,
            rc_app_user_id: evt.app_user_id,
            product_id: evt.product_id ?? null,
            tier,
            status,
            store,
            environment: evt.environment ?? null,
            period_start: purchasedAt,
            period_end: periodEnd,
            trial_end: status === "trialing" ? periodEnd : (existing?.trial_end ?? null),
            auto_renew: evt.type !== "CANCELLATION",
            is_manual: false,
          } as const;
          if (existing) {
            await firebaseAdmin.from("subscriptions").update(patch).eq("id", existing.id);
          } else {
            await firebaseAdmin.from("subscriptions").insert(patch);
          }

          // Payment record for real money events
          if (
            evt.type === "INITIAL_PURCHASE" ||
            evt.type === "RENEWAL" ||
            evt.type === "TRIAL_CONVERTED" ||
            evt.type === "PRODUCT_CHANGE"
          ) {
            const kind =
              evt.type === "TRIAL_CONVERTED"
                ? "trial_conversion"
                : evt.type === "RENEWAL"
                  ? "renewal"
                  : "initial";
            await firebaseAdmin
              .from("payments")
              .insert({
                user_id: userId,
                subscription_id: existing?.id ?? null,
                rc_event_id: evt.id,
                amount_usd: evt.price_in_purchased_currency ?? null,
                currency: evt.currency ?? "USD",
                kind,
                occurred_at: purchasedAt,
                raw: JSON.parse(JSON.stringify(evt)),
              })
              .then(
                () => undefined,
                () => undefined,
              );
          }

          // Reward pending referrals on first paid conversion
          if (evt.type === "INITIAL_PURCHASE" || evt.type === "TRIAL_CONVERTED") {
            const { data: ref } = await firebaseAdmin
              .from("referrals")
              .select("*")
              .eq("referred_id", userId)
              .eq("status", "pending")
              .maybeSingle();
            if (ref) {
              await grantDays(ref.referrer_id, ref.reward_days);
              await grantDays(userId, ref.reward_days);
              await firebaseAdmin
                .from("referrals")
                .update({ status: "rewarded", rewarded_at: new Date().toISOString() })
                .eq("id", ref.id);
            }
          }
        } else if (EXPIRE_TYPES.has(evt.type)) {
          if (existing) {
            const newStatus =
              evt.type === "CANCELLATION"
                ? existing.status
                : evt.type === "REFUND"
                  ? "cancelled"
                  : "expired";
            await firebaseAdmin
              .from("subscriptions")
              .update({
                status: newStatus,
                auto_renew: evt.type === "CANCELLATION" ? false : existing.auto_renew,
                cancelled_at:
                  evt.type === "CANCELLATION" ? new Date().toISOString() : existing.cancelled_at,
              })
              .eq("id", existing.id);
          }
          if (evt.type === "REFUND" && evt.id) {
            await firebaseAdmin
              .from("payments")
              .insert({
                user_id: userId,
                subscription_id: existing?.id ?? null,
                rc_event_id: evt.id,
                amount_usd: evt.price_in_purchased_currency
                  ? -Math.abs(evt.price_in_purchased_currency)
                  : null,
                currency: evt.currency ?? "USD",
                kind: "refund",
                occurred_at: purchasedAt,
                raw: JSON.parse(JSON.stringify(evt)),
              })
              .then(
                () => undefined,
                () => undefined,
              );
          }
        } else if (evt.type === "BILLING_ISSUE") {
          if (existing) {
            await firebaseAdmin
              .from("subscriptions")
              .update({ status: "in_grace" })
              .eq("id", existing.id);
          }
        }

        const { error: completionError } = await firebaseAdmin
          .from("subscription_events")
          .update({ processed: true, completed_at: new Date().toISOString() })
          .eq("rc_event_id", evt.id);
        if (completionError) throw completionError;

        return new Response("ok", { status: 200 });
      },
    },
  },
});

async function grantDays(userId: string, days: number) {
  const { firebaseAdmin } = await import("@/server/firebase-admin");
  const { data: current } = await firebaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const baseline =
    current?.period_end && new Date(current.period_end).getTime() > Date.now()
      ? new Date(current.period_end).getTime()
      : Date.now();
  const newEnd = new Date(baseline + days * 86400000).toISOString();
  if (current) {
    await firebaseAdmin
      .from("subscriptions")
      .update({
        status: "active",
        period_end: newEnd,
        tier: current.tier === "free" ? "promo" : current.tier,
      })
      .eq("id", current.id);
  } else {
    await firebaseAdmin.from("subscriptions").insert({
      user_id: userId,
      tier: "promo",
      status: "active",
      store: "promo",
      period_start: new Date().toISOString(),
      period_end: newEnd,
      is_manual: true,
    });
  }
}
