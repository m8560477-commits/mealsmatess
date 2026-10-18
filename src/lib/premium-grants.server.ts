import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getFirebaseServerServices } from "@/server/firebase-admin";
import { requireAdmin } from "@/lib/admin-access.server";
import { grantStatus, normalizeGrantEmail } from "@/lib/entitlement-policy";

export const GrantInput = z.object({
  email: z.string().trim().email().max(254).transform(normalizeGrantEmail),
  days: z.number().int().min(1).max(3650),
  reason: z.string().trim().max(200).default(""),
  note: z.string().trim().max(1000).default(""),
});
export type PremiumGrant = {
  id: string;
  email: string;
  user_id: string | null;
  duration_days: number;
  starts_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  reason: string;
  note: string;
  grant_count: number;
};
export const grantId = (email: string) =>
  createHash("sha256").update(normalizeGrantEmail(email)).digest("hex");

export async function changeGrant(
  actorId: string,
  action: "grant" | "extend" | "revoke",
  raw: unknown,
) {
  await requireAdmin(actorId);
  const input = GrantInput.parse(raw);
  const { auth, db } = getFirebaseServerServices();
  let verifiedUid: string | null = null;
  try {
    const user = await auth.getUserByEmail(input.email);
    if (user.emailVerified && !user.disabled) verifiedUid = user.uid;
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
  }
  const id = grantId(input.email);
  const ref = db.collection("premium_grants").doc(id);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? (snapshot.data() as PremiumGrant) : null;
    const now = Date.now();
    const stamp = new Date(now).toISOString();
    const status = current ? grantStatus(current, now) : null;
    if (action === "grant" && (status === "active" || status === "pending"))
      throw new Error("A grant already exists. Use Extend Premium.");
    if (action !== "grant" && !current)
      throw new Error("No complimentary grant found for this email.");
    if (action === "extend" && status === "revoked")
      throw new Error("This grant is revoked. Create a new grant.");
    if (action === "revoke" && status === "revoked") return { ok: true, status };
    const userId = action === "grant" ? verifiedUid : current!.user_id;
    const base =
      action === "extend" && current?.expires_at
        ? Math.max(now, Date.parse(current.expires_at) || now)
        : now;
    const next: PremiumGrant =
      action === "revoke"
        ? { ...current!, revoked_at: stamp, updated_at: stamp }
        : {
            id,
            email: input.email,
            user_id: userId,
            duration_days:
              action === "extend" && !userId ? current!.duration_days + input.days : input.days,
            starts_at: userId
              ? action === "extend"
                ? (current?.starts_at ?? stamp)
                : stamp
              : null,
            expires_at: userId ? new Date(base + input.days * 86400000).toISOString() : null,
            revoked_at: null,
            created_by: action === "grant" ? actorId : current!.created_by,
            created_at: action === "grant" ? stamp : current!.created_at,
            updated_at: stamp,
            reason: input.reason || current?.reason || "",
            note: input.note || current?.note || "",
            grant_count: (current?.grant_count ?? 0) + (action === "grant" ? 1 : 0),
          };
    if (next.duration_days > 3650) throw new Error("Pending access cannot exceed 3650 days.");
    transaction.set(ref, next);
    const audit = {
      action,
      actor_id: actorId,
      occurred_at: stamp,
      days: action === "revoke" ? 0 : input.days,
      before: current,
      after: next,
    };
    transaction.set(ref.collection("history").doc(randomUUID()), audit);
    transaction.set(db.collection("audit_logs").doc(randomUUID()), {
      actor_id: actorId,
      action: `premium_grant.${action}`,
      target_table: "premium_grants",
      target_id: id,
      metadata: { days: audit.days },
      created_at: stamp,
    });
    return { ok: true, status: grantStatus(next, now) };
  });
}

/** A fresh Firebase Auth record, never signup input or a profile email, binds a pending grant. */
export async function activatePendingGrant(userId: string) {
  const { auth, db } = getFirebaseServerServices();
  const user = await auth.getUser(userId);
  if (user.disabled || !user.emailVerified || !user.email) return;
  const ref = db.collection("premium_grants").doc(grantId(user.email));
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return;
    const grant = snap.data() as PremiumGrant;
    if (grant.user_id || grant.revoked_at || grant.email !== normalizeGrantEmail(user.email!))
      return;
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + grant.duration_days * 86400000).toISOString();
    transaction.update(ref, {
      user_id: userId,
      starts_at: now,
      expires_at: expires,
      updated_at: now,
    });
    transaction.set(ref.collection("history").doc(randomUUID()), {
      action: "activated",
      actor_id: userId,
      occurred_at: now,
      expires_at: expires,
    });
    transaction.set(db.collection("audit_logs").doc(randomUUID()), {
      actor_id: userId,
      action: "premium_grant.activated",
      target_table: "premium_grants",
      target_id: ref.id,
      created_at: now,
    });
  });
}

export async function listGrants(actorId: string) {
  await requireAdmin(actorId);
  const { db } = getFirebaseServerServices();
  const snapshot = await db.collection("premium_grants").orderBy("updated_at", "desc").get();
  const grants = snapshot.docs.map((doc) => {
    const grant = doc.data() as PremiumGrant;
    return { ...grant, status: grantStatus(grant) };
  });
  return {
    grants,
    counts: {
      total: grants.reduce((sum, g) => sum + g.grant_count, 0),
      active: grants.filter((g) => g.status === "active").length,
      expired: grants.filter((g) => g.status === "expired").length,
      revoked: grants.filter((g) => g.status === "revoked").length,
      pending: grants.filter((g) => g.status === "pending").length,
    },
  };
}
