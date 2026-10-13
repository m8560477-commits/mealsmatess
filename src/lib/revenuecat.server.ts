import { timingSafeEqual, createHash } from "node:crypto";
import { withDatabasePrincipal } from "./database-context.server";

export type VerifiedEntitlement = {
  isPremium: boolean; tier: string; status: string; trialActive: boolean;
  periodEnd: string | null; trialEnd: string | null; store: string | null;
  autoRenew: boolean; isManual: boolean;
};

export function revenueCatConfiguration(platform: string) {
  const variables: Record<string, string> = {
    web: "REVENUECAT_WEB_PUBLIC_API_KEY",
    android: "REVENUECAT_ANDROID_PUBLIC_API_KEY",
    ios: "REVENUECAT_IOS_PUBLIC_API_KEY",
  };
  const prefixes: Record<string, string> = { web: "rcb_", android: "goog_", ios: "appl_" };
  const key = process.env[variables[platform] ?? ""];
  if (!key || !key.startsWith(prefixes[platform] ?? "invalid")) throw new Error(`RevenueCat ${platform} public SDK key is not configured`);
  if (!process.env["REVENUECAT_ENTITLEMENT_ID"]) throw new Error("RevenueCat entitlement identifier is not configured");
  return { publicApiKey: key, entitlementId: process.env["REVENUECAT_ENTITLEMENT_ID"] };
}

type RevenueCatSubscriber = {
  entitlements?: Record<string, { product_identifier?: string; expires_date?: string | null }>;
  subscriptions?: Record<string, { grace_period_expires_date?: string | null; is_sandbox?: boolean; period_type?: string; store?: string; unsubscribe_detected_at?: string | null }>;
  non_subscriptions?: Record<string, Array<{ is_sandbox?: boolean; store?: string }>>;
};

export function interpretEntitlement(subscriber: RevenueCatSubscriber, entitlementId: string, now = Date.now()): VerifiedEntitlement & { productId: string | null; environment: string | null } {
  const entitlement = subscriber.entitlements?.[entitlementId];
  const productId = entitlement?.product_identifier ?? null;
  const subscription = productId ? subscriber.subscriptions?.[productId] : null;
  const purchase = subscription ?? (productId ? subscriber.non_subscriptions?.[productId]?.slice().reverse().find(receipt => receipt.is_sandbox === false) : null);
  const expiresAt = entitlement?.expires_date ?? null;
  const graceAt = subscription?.grace_period_expires_date ?? null;
  const expirationValid = !!entitlement && "expires_date" in entitlement && (expiresAt === null || (typeof expiresAt === "string" && Number.isFinite(Date.parse(expiresAt))));
  const graceValid = typeof graceAt === "string" && Number.isFinite(Date.parse(graceAt));
  const periodEnd = graceValid && Date.parse(graceAt) > Date.parse(expiresAt ?? "") ? graceAt : expiresAt;
  const isPremium = typeof productId === "string" && productId.length > 0 && expirationValid && purchase?.is_sandbox === false && (!periodEnd || Date.parse(periodEnd) > now);
  const trialActive = isPremium && subscription?.period_type === "TRIAL";
  return {
    isPremium, tier: isPremium ? "premium" : "free", status: isPremium ? trialActive ? "trialing" : "active" : "expired",
    trialActive, periodEnd, trialEnd: trialActive ? expiresAt : null,
    store: purchase?.store === "play_store" ? "play_store" : purchase?.store === "app_store" ? "app_store" : productId ? "web" : null,
    autoRenew: isPremium && !!subscription && !subscription.unsubscribe_detected_at && !!expiresAt,
    isManual: false, productId, environment: subscription?.is_sandbox ? "SANDBOX" : "PRODUCTION",
  };
}

export async function verifyRevenueCatEntitlement(userId: string): Promise<VerifiedEntitlement> {
  const key = process.env["REVENUECAT_API_KEY"];
  const entitlementId = process.env["REVENUECAT_ENTITLEMENT_ID"];
  if (!key || !entitlementId) throw new Error("RevenueCat server key or entitlement identifier is not configured");
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok && response.status !== 404) throw new Error(`RevenueCat verification is unavailable (${response.status})`);
  const payload = response.status === 404 ? { subscriber: {} } : await response.json();
  if (!payload.subscriber || typeof payload.subscriber !== "object") throw new Error("RevenueCat returned an invalid subscriber response");
  const verified = interpretEntitlement(payload.subscriber, entitlementId);
  await withDatabasePrincipal({ trusted: true }, async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`revenuecat:${userId}`]);
    await client.query("UPDATE subscriptions SET status='expired', updated_at=now() WHERE user_id=$1 AND rc_app_user_id=$1", [userId]);
    if (verified.productId) {
      const current = await client.query("SELECT id FROM subscriptions WHERE user_id=$1 AND rc_app_user_id=$1 AND product_id=$2 LIMIT 1", [userId, verified.productId]);
      const args = [userId, verified.productId, verified.status, verified.tier, verified.store, verified.periodEnd, verified.trialEnd, verified.autoRenew, verified.environment];
      if (current.rows[0]) await client.query("UPDATE subscriptions SET status=$3, tier=$4, store=$5, period_end=$6, trial_end=$7, auto_renew=$8, environment=$9, updated_at=now() WHERE user_id=$1 AND product_id=$2 AND rc_app_user_id=$1", args);
      else await client.query("INSERT INTO subscriptions (user_id, product_id, status, tier, store, period_end, trial_end, auto_renew, environment, rc_app_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$1)", args);
    }
  });
  return verified;
}

export async function refreshRevenueCatEntitlement(userId: string) {
  if (process.env["REVENUECAT_API_KEY"] && process.env["REVENUECAT_ENTITLEMENT_ID"]) return verifyRevenueCatEntitlement(userId);
  await withDatabasePrincipal({ trusted: true }, async client => {
    await client.query("UPDATE subscriptions SET status='expired', updated_at=now() WHERE user_id=$1 AND rc_app_user_id=$1 AND status <> 'expired'", [userId]);
  });
  return null;
}

export async function handleRevenueCatWebhook(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const secret = process.env["REVENUECAT_WEBHOOK_SECRET"];
  if (!secret) return new Response("Webhook is not configured", { status: 503 });
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`))) return new Response("Unauthorized", { status: 401 });
  try {
    const raw = await request.text();
    if (raw.length > 128 * 1024) return new Response(null, { status: 413 });
    const payload = JSON.parse(raw);
    const event = payload.event;
    if (!event || typeof event.id !== "string" || typeof event.type !== "string") return new Response("Invalid event", { status: 400 });
    const ids = [...new Set<string>(event.type === "TRANSFER" ? [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])] : [event.app_user_id])];
    if (ids.length > 20) return new Response("Invalid event", { status: 400 });
    const registeredIds = await withDatabasePrincipal({ trusted: true }, async client => {
      const existing = await client.query("SELECT id FROM subscription_events WHERE rc_event_id=$1", [event.id]);
      if (existing.rows.length) return null;
      return (await client.query("SELECT id FROM auth_user WHERE id=ANY($1::text[])", [ids.filter(id => typeof id === "string")])).rows.map((row: { id: string }) => row.id);
    });
    if (registeredIds === null) return new Response("Already processed");
    for (const userId of registeredIds) await verifyRevenueCatEntitlement(userId);
    await withDatabasePrincipal({ trusted: true }, async client => {
      await client.query("INSERT INTO subscription_events (rc_event_id, event_type, payload, processed_at, source) VALUES ($1,$2,$3::jsonb,now(),'revenuecat') ON CONFLICT (rc_event_id) DO NOTHING", [event.id, event.type, JSON.stringify(payload)]);
    });
    return new Response("Processed");
  } catch {
    return new Response("Verification failed; retry later", { status: 503 });
  }
}
