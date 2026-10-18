import { getFirebaseServerServices } from "@/server/firebase-admin";
import { grantId } from "@/lib/premium-grants.server";
import { normalizeGrantEmail } from "@/lib/entitlement-policy";

/** Idempotent, additive migration. Original subscription records are never changed. */
export async function migrateLegacyAccess(userId: string) {
  const { db, auth } = getFirebaseServerServices();
  const marker = db.collection("access_migrations").doc(userId);
  if ((await marker.get()).exists) return;
  const identity = await auth.getUser(userId);
  if (identity.disabled || !identity.emailVerified || !identity.email) return;
  const email = normalizeGrantEmail(identity.email);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(marker)).exists) return;
    const subscriptions = await tx.get(
      db.collection("subscriptions").where("user_id", "==", userId),
    );
    const manual = subscriptions.docs.filter(
      (doc) => doc.data().is_manual === true && ["admin", "promo"].includes(doc.data().store),
    );
    const admin = manual
      .filter(
        (doc) =>
          doc.data().store === "admin" &&
          ["active", "trialing", "in_grace"].includes(doc.data().status) &&
          Date.parse(doc.data().period_end) > Date.now(),
      )
      .sort((a, b) => Date.parse(b.data().period_end) - Date.parse(a.data().period_end))[0];
    const ref = db.collection("premium_grants").doc(grantId(email));
    const current = await tx.get(ref);
    const now = new Date().toISOString();
    if (admin && !current.exists) {
      const row = admin.data();
      const start =
        row.period_start && Number.isFinite(Date.parse(row.period_start)) ? row.period_start : now;
      const days = Math.max(
        1,
        Math.ceil((Date.parse(row.period_end) - Date.parse(start)) / 86400000),
      );
      tx.set(ref, {
        id: ref.id,
        email,
        user_id: userId,
        duration_days: days,
        starts_at: start,
        expires_at: row.period_end,
        revoked_at: null,
        created_by: row.granted_by ?? "legacy-server-migration",
        created_at: row.created_at ?? now,
        updated_at: now,
        reason: "Migrated existing administrator access",
        note: "",
        grant_count: 1,
      });
      tx.set(ref.collection("history").doc("migration"), {
        action: "migrated",
        actor_id: "system",
        occurred_at: now,
        days,
        expires_at: row.period_end,
      });
    }
    for (const doc of manual.filter((doc) => doc.data().store === "promo"))
      tx.set(db.collection("legacy_premium_access").doc(`migrated_${doc.id}`), {
        ...doc.data(),
        migrated_at: now,
      });
    tx.set(marker, { version: 1, completed_at: now });
    tx.set(db.collection("audit_logs").doc(), {
      actor_id: "system",
      action: "premium.migrated",
      target_id: userId,
      created_at: now,
    });
  });
}
