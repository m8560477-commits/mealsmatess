import { createHash } from "node:crypto";
import { z } from "zod";
import { getFirebaseAdminFirestore, getFirebaseAdminAuth } from "@/server/firebase-admin";
import { manualGrantActive, revenueCatAccess } from "@/lib/entitlement-policy";
export function emailGrantId(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}
const accessSchema = z.object({
  isPremium: z.boolean(),
  tier: z.string(),
  status: z.string(),
  trialActive: z.boolean(),
  periodEnd: z.string().nullable(),
  trialEnd: z.string().nullable(),
  store: z.string().nullable(),
  autoRenew: z.boolean(),
  isManual: z.boolean(),
});
const free = {
  isPremium: false,
  tier: "free",
  status: "expired",
  trialActive: false,
  periodEnd: null,
  trialEnd: null,
  store: null,
  autoRenew: false,
  isManual: false,
};
export async function resolveEntitlement(userId: string, force = false, paidOnly = false) {
  const db = getFirebaseAdminFirestore();
  const account = await getFirebaseAdminAuth().getUser(userId);
  if (account.disabled) return free;
  const refs = [db.collection("premium_grants").doc(userId)];
  if (account.email && account.emailVerified)
    refs.push(db.collection("premium_email_grants").doc(emailGrantId(account.email)));
  for (const grant of paidOnly ? [] : await db.getAll(...refs))
    if (manualGrantActive(grant.data() ?? {}))
      return {
        ...free,
        isPremium: true,
        tier: "promo",
        status: "active",
        isManual: true,
        store: "admin",
        periodEnd: String(grant.get("expiresAt")),
      };
  // Preserve finite, server-created legacy promo/referral grants without accepting paid rows as proof.
  const grants = await db
    .collection("subscriptions")
    .where("user_id", "==", userId)
    .where("is_manual", "==", true)
    .where("status", "==", "active")
    .get();
  const awaitedGrantExists = (await db.collection("premium_grants").doc(userId).get()).exists;
  const legacy = grants.docs
    .map((doc) => doc.data())
    .find(
      (g: Record<string, unknown>) =>
        (g.store === "promo" || (g.store === "admin" && !awaitedGrantExists)) &&
        (g.tier === "lifetime" ||
          (typeof g.period_end === "string" && Date.parse(g.period_end) > Date.now())),
    );
  if (legacy && !paidOnly)
    return {
      ...free,
      isPremium: true,
      tier: String(legacy.tier),
      status: "active",
      isManual: true,
      store: "promo",
      periodEnd: legacy.period_end ?? null,
    };
  const ref = db.collection("revenuecat_entitlements").doc(userId);
  const cached = await ref.get();
  const expected = process.env.REVENUECAT_ENTITLEMENT_ID;
  const secret = process.env.REVENUECAT_SECRET_API_KEY;
  if (!secret || !expected)
    throw new Error("Subscription verification is not configured. Contact MealMate support.");
  const fresh =
    cached.get("entitlementId") === expected &&
    Number(cached.get("checkedAt") ?? 0) > Date.now() - 5 * 60_000;
  if (!force && fresh) {
    const access = accessSchema.parse(cached.get("access"));
    if (!access.periodEnd || Date.parse(access.periodEnd) > Date.now()) return access;
  }
  try {
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) throw new Error("Subscription verification is temporarily unavailable.");
    const access = revenueCatAccess(await response.json(), expected);
    await ref.set({ access, checkedAt: Date.now(), entitlementId: expected });
    return access;
  } catch {
    // Brief outages may use only a recently verified, unexpired entitlement.
    if (fresh && !paidOnly) {
      const access = accessSchema.parse(cached.get("access"));
      if (!access.periodEnd || Date.parse(access.periodEnd) > Date.now()) return access;
    }
    throw new Error("Could not verify your subscription. Please reconnect and retry.");
  }
}

// Billing verification failures never grant premium or remove the free allowance.
export async function premiumForUsage(userId: string) {
  try {
    return (await resolveEntitlement(userId)).isPremium;
  } catch {
    console.warn("[entitlement] verification unavailable; applying free limits");
    return false;
  }
}
