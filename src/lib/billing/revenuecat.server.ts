import { createHash } from "node:crypto";
import { getFirebaseAdminFirestore, firebaseAdmin } from "@/server/firebase-admin";
import { activeGrant, verifiedSubscription, type BillingPolicy } from "./revenuecat-policy";

export function revenueCatConfig() {
  const entitlement = process.env.REVENUECAT_CONSUMER_ENTITLEMENT_ID?.trim();
  const offering = process.env.REVENUECAT_CONSUMER_OFFERING_ID?.trim();
  const productIds = (process.env.REVENUECAT_CONSUMER_PRODUCT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const environment = process.env.REVENUECAT_ENVIRONMENT;
  // Old Vercel names remain supported during migration, with explicit key type checks.
  const secret = process.env.REVENUECAT_SECRET_API_KEY || process.env.REVENUECAT_API_KEY;
  const androidKey = process.env.REVENUECAT_ANDROID_PUBLIC_KEY || process.env.REVENUECAT_SDK_KEY;
  if (
    !entitlement ||
    !offering ||
    !productIds.length ||
    !["PRODUCTION", "SANDBOX"].includes(environment ?? "") ||
    !secret?.startsWith("sk_") ||
    !androidKey?.startsWith("goog_")
  ) {
    throw new Error("Mobile subscriptions are not configured yet. Please try again later.");
  }
  return {
    entitlement,
    offering,
    productIds,
    environment: environment as BillingPolicy["environment"],
    secret,
    androidKey,
  };
}

export async function assertBillingAccount(uid: string) {
  const profile = await getFirebaseAdminFirestore().collection("users").doc(uid).get();
  const data = profile.data();
  if (
    data?.disabled ||
    data?.deletion_pending ||
    data?.deletion_requested_at ||
    ["deleted", "suspended", "deleting"].includes(data?.status)
  ) {
    throw new Error("Purchases are unavailable for this account. Contact support.");
  }
}

export async function preflightPurchase(uid: string, productId: string) {
  const config = revenueCatConfig();
  await assertBillingAccount(uid);
  if (!config.productIds.includes(productId)) throw new Error("This product is unavailable.");
  await refreshRevenueCat(uid);
  const subscriptions = await getFirebaseAdminFirestore()
    .collection("subscriptions")
    .where("user_id", "==", uid)
    .get();
  if (subscriptions.docs.some((doc) => activeGrant(doc.data())))
    throw new Error(
      "You already have Premium. Manage your existing subscription instead of purchasing again.",
    );
  return { ok: true as const };
}

export async function refreshRevenueCat(uid: string) {
  const config = revenueCatConfig();
  await assertBillingAccount(uid);
  const startedAt = Date.now();
  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
    {
      headers: { Authorization: `Bearer ${config.secret}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    },
  );
  if (!response.ok && response.status !== 404)
    throw new Error(
      "Purchase verification is temporarily unavailable. Refresh access before purchasing again.",
    );
  const body =
    response.status === 404
      ? { subscriber: { original_app_user_id: uid, entitlements: {}, subscriptions: {} } }
      : await response.json();
  const verified = verifiedSubscription(body, uid, config, Date.now());
  const db = getFirebaseAdminFirestore();
  const id = `revenuecat_${config.environment === "SANDBOX" ? "sandbox_" : ""}${createHash("sha256").update(uid).digest("hex")}`;
  const ref = db.collection("subscriptions").doc(id);
  await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if ((current.data()?.rc_verified_at_ms ?? 0) >= startedAt) return;
    const previous = await tx.get(db.collection("subscriptions").where("user_id", "==", uid));
    // Retire legacy RevenueCat rows, preserving manual/promo and other providers.
    for (const doc of previous.docs) {
      const row = doc.data();
      if (
        doc.id !== id &&
        row.rc_app_user_id === uid &&
        (row.environment ?? "PRODUCTION") === config.environment &&
        !row.is_manual &&
        ["play_store", "app_store", "stripe", "promo"].includes(row.store)
      ) {
        tx.update(doc.ref, { status: "expired", auto_renew: false });
      }
    }
    // Existing promo/admin grant code may have converted the prior RC row into a
    // manual grant. Preserve that grant before restoring this dedicated RC row.
    const old = current.data();
    if (old?.is_manual) {
      const manualId = `${id}_manual_${createHash("sha256").update(JSON.stringify(old)).digest("hex")}`;
      tx.set(db.collection("subscriptions").doc(manualId), {
        ...old,
        id: manualId,
        rc_app_user_id: null,
        source: "manual",
        environment: null,
      });
    }
    tx.set(ref, {
      ...verified,
      id,
      rc_verified_at_ms: startedAt,
      created_at: current.data()?.created_at ?? new Date(startedAt).toISOString(),
    });
  });
  // Read back the winning verification if concurrent refreshes finished out of order.
  const saved = (await ref.get()).data();
  return { active: !!saved && activeGrant(saved), sandbox: saved?.sandbox_verified === true };
}

export async function billingRateLimit(uid: string) {
  const { data, error } = await firebaseAdmin.rpc("check_rate_limit", {
    _bucket: "native-billing",
    _identifier: uid,
    _max_per_minute: 12,
  });
  if (error) throw new Error("Billing is temporarily unavailable.");
  if (!data) throw new Error("Please wait a minute before trying again.");
}
