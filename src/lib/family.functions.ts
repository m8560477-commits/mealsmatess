import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { getFirebaseServerServices } from "@/server/firebase-admin";
import { resolveEntitlement } from "@/lib/entitlements.server";
import { normalizeGrantEmail } from "@/lib/entitlement-policy";
import { grantId } from "@/lib/premium-grants.server";

async function requireFamilyOwner(userId: string) {
  const access = await resolveEntitlement(userId);
  if (
    !access.sources.some(
      (source) => ["paid", "trial"].includes(source.source) && source.tier === "family",
    )
  )
    throw new Error("An active family subscription is required.");
}
export const getMyFamily = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { db, auth } = getFirebaseServerServices();
    const owned = await db.collection("family_households").doc(context.userId).get();
    const identity = await auth.getUser(context.userId);
    const pending =
      identity.emailVerified && identity.email
        ? await db
            .collection("family_invitations")
            .where("email", "==", normalizeGrantEmail(identity.email))
            .get()
        : null;
    const membership = (await db.collection("family_memberships").doc(context.userId).get()).data();
    return {
      membership: !!membership && !membership.revoked_at,
      members: Object.values(
        (owned.data()?.members ?? {}) as Record<string, { email: string; user_id: string | null }>,
      ),
      invitations: (pending?.docs ?? [])
        .filter((doc) => !doc.data().revoked_at && !doc.data().accepted_at)
        .map((doc) => ({ id: doc.id, createdAt: String(doc.data().created_at) })),
    };
  });
export const inviteFamilyMember = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((raw: unknown) =>
    z
      .object({ email: z.string().trim().email().max(254).transform(normalizeGrantEmail) })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await requireFamilyOwner(context.userId);
    const { auth, db } = getFirebaseServerServices();
    const owner = await auth.getUser(context.userId);
    if (owner.email && normalizeGrantEmail(owner.email) === data.email)
      throw new Error("You already own this family plan.");
    const key = grantId(data.email);
    const id = `${context.userId}_${key}`;
    const ref = db.collection("family_households").doc(context.userId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const members = snap.data()?.members ?? {};
      if (members[key]) throw new Error("This email is already invited.");
      if (Object.keys(members).length >= 5)
        throw new Error("Family plans allow the owner and five members.");
      members[key] = { email: data.email, user_id: null };
      tx.set(ref, { owner_id: context.userId, members }, { merge: true });
      tx.set(db.collection("family_invitations").doc(id), {
        owner_id: context.userId,
        email: data.email,
        created_at: new Date().toISOString(),
        revoked_at: null,
        accepted_at: null,
      });
      tx.set(db.collection("audit_logs").doc(randomUUID()), {
        actor_id: context.userId,
        action: "family.invited",
        target_id: id,
        created_at: new Date().toISOString(),
      });
    });
    return { ok: true };
  });
export const acceptFamilyInvitation = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        id: z
          .string()
          .min(1)
          .max(220)
          .regex(/^[A-Za-z0-9_-]+$/),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { db, auth } = getFirebaseServerServices();
    const identity = await auth.getUser(context.userId);
    if (!identity.emailVerified || !identity.email || identity.disabled)
      throw new Error("Verify your email first.");
    const email = normalizeGrantEmail(identity.email);
    const ref = db.collection("family_invitations").doc(data.id);
    const initial = (await ref.get()).data();
    if (!initial || initial.email !== email) throw new Error("Invitation unavailable.");
    await requireFamilyOwner(initial.owner_id);
    await db.runTransaction(async (tx) => {
      const invite = (await tx.get(ref)).data();
      const membershipRef = db.collection("family_memberships").doc(context.userId);
      const previous = (await tx.get(membershipRef)).data();
      const householdRef = db.collection("family_households").doc(initial.owner_id);
      const household = (await tx.get(householdRef)).data();
      if (
        !invite ||
        invite.email !== email ||
        invite.revoked_at ||
        !household?.members?.[grantId(email)]
      )
        throw new Error("Invitation unavailable.");
      if (previous && !previous.revoked_at && previous.owner_id !== initial.owner_id)
        throw new Error("Leave your current family before joining another.");
      const now = new Date().toISOString();
      tx.set(membershipRef, {
        user_id: context.userId,
        owner_id: invite.owner_id,
        email,
        joined_at: now,
        revoked_at: null,
      });
      tx.update(ref, { accepted_at: now });
      tx.update(householdRef, { [`members.${grantId(email)}.user_id`]: context.userId });
    });
    return { ok: true };
  });
export const removeFamilyMember = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((raw: unknown) =>
    z
      .object({ email: z.string().trim().email().max(254).transform(normalizeGrantEmail) })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { db } = getFirebaseServerServices();
    const ref = db.collection("family_households").doc(context.userId);
    const key = grantId(data.email);
    await db.runTransaction(async (tx) => {
      const household = (await tx.get(ref)).data();
      if (!household || household.owner_id !== context.userId || !household.members?.[key])
        throw new Error("Family member unavailable.");
      const member = household.members[key];
      const now = new Date().toISOString();
      const membershipRef = member.user_id
        ? db.collection("family_memberships").doc(member.user_id)
        : null;
      const current = membershipRef ? (await tx.get(membershipRef)).data() : null;
      delete household.members[key];
      tx.set(ref, household);
      tx.set(
        db.collection("family_invitations").doc(`${context.userId}_${key}`),
        { revoked_at: now },
        { merge: true },
      );
      if (membershipRef && current?.owner_id === context.userId)
        tx.update(membershipRef, { revoked_at: now });
      tx.set(db.collection("audit_logs").doc(randomUUID()), {
        actor_id: context.userId,
        action: "family.removed",
        target_id: key,
        created_at: now,
      });
    });
    return { ok: true };
  });

export const leaveFamily = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { db } = getFirebaseServerServices();
    const ref = db.collection("family_memberships").doc(context.userId);
    await db.runTransaction(async (tx) => {
      const member = (await tx.get(ref)).data();
      if (!member || member.revoked_at) return;
      const householdRef = db.collection("family_households").doc(member.owner_id);
      const household = (await tx.get(householdRef)).data();
      const members = { ...(household?.members ?? {}) };
      if (members[grantId(member.email)]?.user_id === context.userId)
        delete members[grantId(member.email)];
      const now = new Date().toISOString();
      tx.update(ref, { revoked_at: now });
      if (household) tx.update(householdRef, { members });
      tx.set(
        db.collection("family_invitations").doc(`${member.owner_id}_${grantId(member.email)}`),
        { revoked_at: now },
        { merge: true },
      );
      tx.set(db.collection("audit_logs").doc(), {
        actor_id: context.userId,
        action: "family.left",
        created_at: now,
      });
    });
    return { ok: true };
  });
