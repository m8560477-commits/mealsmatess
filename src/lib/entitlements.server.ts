import { migrateLegacyAccess } from "@/lib/legacy-access.server";
import { getFirebaseServerServices } from "@/server/firebase-admin";
import { activatePendingGrant } from "@/lib/premium-grants.server";
import { entitlementFromSources, type AccessSource } from "@/lib/entitlement-policy";
import { syncRevenueCat, type BillingSnapshot } from "@/lib/revenuecat.server";

const MAX_VERIFICATION_AGE = 6 * 60 * 60 * 1000;
async function directSources(
  userId: string,
  refresh: boolean,
): Promise<{
  sources: AccessSource[];
  billing: BillingSnapshot | null;
  billingUnavailable: boolean;
}> {
  const { db } = getFirebaseServerServices();
  let billing = (await db.collection("billing_customers").doc(userId).get()).data() as
    BillingSnapshot | undefined;
  let billingUnavailable = false;
  const fresh =
    billing &&
    Date.parse(billing.verified_at) <= Date.now() &&
    Date.now() - Date.parse(billing.verified_at) < MAX_VERIFICATION_AGE;
  if (refresh || (!fresh && process.env["REVENUECAT_SECRET_API_KEY"])) {
    try {
      billing = await syncRevenueCat(userId);
    } catch {
      billingUnavailable = true;
    }
  }
  const sources: AccessSource[] = [];
  if (
    billing?.is_active &&
    Date.parse(billing.verified_at) <= Date.now() &&
    Date.now() - Date.parse(billing.verified_at) < MAX_VERIFICATION_AGE
  ) {
    sources.push({
      source: billing.is_trial ? "trial" : "paid",
      expiresAt: billing.expires_at,
      tier: billing.is_family ? "family" : "premium",
      autoRenew: billing.auto_renew,
    });
  }
  const grants = await db.collection("premium_grants").where("user_id", "==", userId).get();
  for (const doc of grants.docs) {
    const grant = doc.data();
    sources.push({
      source: "complimentary",
      tier: "premium",
      expiresAt: grant.expires_at ?? null,
      startsAt: grant.starts_at ?? null,
      revoked: !!grant.revoked_at,
    });
  }
  // Historical promotions stay independent of paid subscriptions. All are server-owned.
  const legacy = await db.collection("legacy_premium_access").where("user_id", "==", userId).get();
  for (const doc of legacy.docs) {
    const row = doc.data();
    sources.push({
      source: "legacy",
      tier: "premium",
      expiresAt: row.period_end ?? null,
      lifetime: row.tier === "lifetime",
      revoked: !["active", "trialing", "in_grace"].includes(row.status),
    });
  }
  return { sources, billing: billing ?? null, billingUnavailable };
}

export async function resolveEntitlement(userId: string, refresh = false) {
  const identity = await getFirebaseServerServices().auth.getUser(userId);
  if (identity.disabled)
    return { ...entitlementFromSources([]), managementUrl: null, billingUnavailable: false };
  await migrateLegacyAccess(userId);
  await activatePendingGrant(userId);
  const { sources, billing, billingUnavailable } = await directSources(userId, refresh);
  const { auth, db } = getFirebaseServerServices();
  const membership = (await db.collection("family_memberships").doc(userId).get()).data();
  if (membership && !membership.revoked_at && membership.owner_id !== userId) {
    const identity = await auth.getUser(userId);
    if (
      !identity.disabled &&
      identity.emailVerified &&
      identity.email?.trim().toLowerCase() === membership.email
    ) {
      const ownerIdentity = await auth.getUser(String(membership.owner_id)).catch(() => null);
      const household = (
        await db.collection("family_households").doc(membership.owner_id).get()
      ).data();
      const { grantId } = await import("@/lib/premium-grants.server");
      if (
        !ownerIdentity ||
        ownerIdentity.disabled ||
        household?.members?.[grantId(membership.email)]?.user_id !== userId
      )
        return {
          ...entitlementFromSources(sources),
          managementUrl: billing?.management_url ?? null,
          billingUnavailable,
        };
      const owner = await directSources(String(membership.owner_id), false);
      const paidFamily = entitlementFromSources(owner.sources).sources.find(
        (source) => source.tier === "family" && ["paid", "trial"].includes(source.source),
      );
      if (paidFamily)
        sources.push({ source: "family", tier: "family", expiresAt: paidFamily.expiresAt });
    }
  }
  return {
    ...entitlementFromSources(sources),
    managementUrl: billing?.management_url ?? null,
    billingUnavailable,
  };
}
export async function requirePremiumAccess(userId: string) {
  if (!(await resolveEntitlement(userId)).isPremium)
    throw new Error("An active MealMate subscription, trial, or complimentary grant is required.");
}
