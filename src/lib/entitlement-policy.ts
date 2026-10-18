export type AccessSource = {
  source: "paid" | "trial" | "complimentary" | "family" | "legacy";
  expiresAt: string | null;
  lifetime?: boolean;
  revoked?: boolean;
  startsAt?: string | null;
  tier: string;
  autoRenew?: boolean;
};

export function activeAccess(source: AccessSource, now = Date.now()) {
  if (source.revoked) return false;
  if (
    source.startsAt &&
    (!Number.isFinite(Date.parse(source.startsAt)) || Date.parse(source.startsAt) > now)
  )
    return false;
  return (
    source.lifetime === true ||
    (source.expiresAt !== null &&
      Number.isFinite(Date.parse(source.expiresAt)) &&
      Date.parse(source.expiresAt) > now)
  );
}

export function entitlementFromSources(sources: AccessSource[], now = Date.now()) {
  const active = sources.filter((source) => activeAccess(source, now));
  const primary =
    active.find((source) => source.source === "paid") ??
    active.find((source) => source.source === "trial") ??
    active[0];
  return {
    isPremium: active.length > 0,
    tier: primary?.tier ?? "none",
    status: primary ? (primary.source === "trial" ? "trialing" : "active") : "inactive",
    trialActive: active.some((source) => source.source === "trial"),
    periodEnd: primary?.expiresAt ?? null,
    trialEnd: active.find((source) => source.source === "trial")?.expiresAt ?? null,
    autoRenew: primary?.autoRenew ?? false,
    isManual: primary?.source === "complimentary",
    store: primary?.source ?? null,
    sources: active,
  };
}

export function normalizeGrantEmail(email: string) {
  return email.trim().toLowerCase();
}
export function grantStatus(
  grant: { user_id?: string | null; revoked_at?: string | null; expires_at?: string | null },
  now = Date.now(),
) {
  if (grant.revoked_at) return "revoked" as const;
  if (!grant.user_id) return "pending" as const;
  return grant.expires_at && Date.parse(grant.expires_at) > now
    ? ("active" as const)
    : ("expired" as const);
}
