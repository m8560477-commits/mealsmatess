import { campaignMetrics } from "@/server/notification-metrics";
import { categoryEnabled, preferencesFrom } from "@/lib/notification-policy";
import { deliverPendingNotifications } from "@/server/user-notifications";
import { createHash, randomUUID } from "node:crypto";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore, getFirebaseAdminAuth } from "@/server/firebase-admin";
import { isHealthyInterest } from "@/lib/notification-segments";
import type { AnnouncementAudience, AnnouncementInput } from "@/lib/notifications.types";

const PAGE_SIZE = 25;
const LEASE_MS = 5 * 60_000;
const EXCLUDED_ROLES = new Set([
  "admin",
  "restaurant_owner",
  "restaurant_admin",
  "restaurant_manager",
  "partner_owner",
  "partner_admin",
]);

function settingsRef(db: Firestore, userId: string) {
  return db.collection("users").doc(userId).collection("notification_settings").doc("preferences");
}

function profileIsIneligible(profile: Record<string, unknown>) {
  return profile.deleted === true || profile.disabled === true || profile.account_disabled === true;
}

async function resolveSelected(values: string[] = []) {
  const ids = new Set<string>();
  for (const value of values) {
    const target = value.trim();
    if (!target) continue;
    try {
      const account = target.includes("@")
        ? await getFirebaseAdminAuth().getUserByEmail(target.toLowerCase())
        : await getFirebaseAdminAuth().getUser(target);
      if (!account.disabled) ids.add(account.uid);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (
        code !== "auth/user-not-found" &&
        code !== "auth/invalid-email" &&
        code !== "auth/invalid-uid"
      )
        throw error;
    }
  }
  return [...ids];
}
async function profileMatchesAudience(
  audience: AnnouncementAudience,
  profile: Record<string, unknown>,
  userId: string,
  selected: string[],
  paidAudience: Set<string>,
) {
  if (audience === "selected") return selected.includes(userId);
  if (audience === "healthy_interest") return isHealthyInterest(profile);
  if (audience === "premium" || audience === "trial") return paidAudience.has(userId);
  return true;
}

async function storedPaidAudience(db: Firestore, audience: AnnouncementAudience) {
  const matched = new Set<string>();
  if (audience !== "premium" && audience !== "trial") return matched;
  const expected = process.env.REVENUECAT_ENTITLEMENT_ID;
  if (!expected) return matched;
  // Trusted snapshots originate only from verified RevenueCat subscriber responses.
  // No per-recipient provider calls and no legacy product-name inferred access.
  const snapshots = await db
    .collection("revenuecat_entitlements")
    .where("access.isPremium", "==", true)
    .get();
  for (const row of snapshots.docs) {
    const access = row.get("access");
    if (row.get("entitlementId") !== expected || access?.isManual) continue;
    const expires = access?.periodEnd;
    const valid =
      typeof expires === "string"
        ? Date.parse(expires) > Date.now()
        : Number(row.get("checkedAt") ?? 0) > Date.now() - 5 * 60_000;
    if (
      valid &&
      (audience === "trial" ? access.trialActive === true : access.trialActive === false)
    )
      matched.add(row.id);
  }
  return matched;
}

function consumerRoleExclusions(db: Firestore) {
  return db
    .collection("user_roles")
    .get()
    .then((snapshot) => {
      const excluded = new Set<string>();
      for (const document of snapshot.docs) {
        const role = String(document.get("role") ?? "").toLowerCase();
        const userId = String(document.get("user_id") ?? "");
        if (userId && EXCLUDED_ROLES.has(role)) excluded.add(userId);
      }
      return excluded;
    });
}

export async function previewAudience(
  audience: AnnouncementAudience,
  category = "general",
  selectedUsers: string[] = [],
) {
  const selected = await resolveSelected(selectedUsers);
  const db = getFirebaseAdminFirestore();
  const [profiles, excludedRoles, paidAudience] = await Promise.all([
    db.collection("users").get(),
    consumerRoleExclusions(db),
    storedPaidAudience(db, audience),
  ]);
  const settingsByUser = new Map<string, Record<string, unknown>>();
  for (let offset = 0; offset < profiles.docs.length; offset += PAGE_SIZE) {
    const page = profiles.docs.slice(offset, offset + PAGE_SIZE);
    const settings = await db.getAll(...page.map((profile) => settingsRef(db, profile.id)));
    page.forEach((profile, index) => settingsByUser.set(profile.id, settings[index]?.data() ?? {}));
  }
  let count = 0;
  for (const profileDoc of profiles.docs) {
    const profile = profileDoc.data() as Record<string, unknown>;
    const preferences = settingsByUser.get(profileDoc.id) ?? {};
    if (
      !excludedRoles.has(profileDoc.id) &&
      !profileIsIneligible(profile) &&
      categoryEnabled(category, preferencesFrom(preferences)) &&
      (await profileMatchesAudience(audience, profile, profileDoc.id, selected, paidAudience))
    )
      count += 1;
  }
  return { count, audience };
}

export async function saveAnnouncement(input: AnnouncementInput, actorId: string) {
  const db = getFirebaseAdminFirestore();
  const selectedUserIds =
    input.audience === "selected" ? await resolveSelected(input.selectedUsers) : [];
  if (input.audience === "selected" && !selectedUserIds.length)
    throw new Error("Choose at least one existing account.");
  const now = new Date().toISOString();
  if (input.status === "scheduled") {
    const when = input.scheduledAt ? Date.parse(input.scheduledAt) : NaN;
    if (!Number.isFinite(when) || when <= Date.now()) {
      throw new Error("Choose a future date and time to schedule this announcement.");
    }
  }

  const collection = db.collection("admin_announcements");
  if (!input.id) {
    const ref = collection.doc(randomUUID());
    const record = {
      ...input,
      selectedUserIds,
      scheduleAt: input.status === "scheduled" ? input.scheduledAt : null,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
      lastRecipientId: null,
      leaseUntil: null,
      recipientCount: 0,
      readCount: 0,
      pushAttemptedTokens: 0,
      pushAcceptedTokens: 0,
      pushFailedTokens: 0,
    };
    await ref.create(record);
    return { id: ref.id, status: input.status };
  }

  const ref = collection.doc(input.id);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Announcement not found.");
    const existing = snapshot.data()!;
    if (existing["status"] !== "draft" && existing["status"] !== "scheduled") {
      throw new Error("Only draft or scheduled announcements can be edited.");
    }
    transaction.update(ref, {
      ...input,
      selectedUserIds,
      scheduleAt: input.status === "scheduled" ? input.scheduledAt : null,
      updatedAt: now,
      updatedBy: actorId,
    });
    return { id: ref.id, status: input.status };
  });
}

async function claimAnnouncement(id: string, allowImmediate: boolean) {
  const db = getFirebaseAdminFirestore();
  const ref = db.collection("admin_announcements").doc(id);
  const now = Date.now();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const record = snapshot.data()!;
    const status = String(record["status"] ?? "");
    const scheduleAt = Date.parse(String(record["scheduleAt"] ?? ""));
    const due = status === "scheduled" && Number.isFinite(scheduleAt) && scheduleAt <= now;
    const immediate = allowImmediate && ["draft", "scheduled", "failed"].includes(status);
    const expiredProcessing = status === "processing" && Number(record["leaseUntil"] ?? 0) <= now;
    if (!due && !immediate && !expiredProcessing) return null;
    transaction.update(ref, {
      status: "processing",
      leaseUntil: now + LEASE_MS,
      processingStartedAt: new Date(now).toISOString(),
      lastError: null,
      updatedAt: new Date(now).toISOString(),
    });
    return { ...record, id: ref.id } as Record<string, unknown>;
  });
}

async function processRecipientPage(announcement: Record<string, unknown>) {
  const db = getFirebaseAdminFirestore();
  const audience = String(announcement["audience"] ?? "all_consumers") as AnnouncementAudience;
  let query = db.collection("users").orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
  const lastRecipientId =
    typeof announcement["lastRecipientId"] === "string" ? announcement["lastRecipientId"] : null;
  if (lastRecipientId) query = query.startAfter(lastRecipientId);
  const [profiles, excludedRoles, paidAudience] = await Promise.all([
    query.get(),
    consumerRoleExclusions(db),
    storedPaidAudience(db, audience),
  ]);
  const announcementRef = db.collection("admin_announcements").doc(String(announcement["id"]));
  if (profiles.empty) {
    await announcementRef.update({
      status: "published",
      publishedAt: new Date().toISOString(),
      leaseUntil: null,
      updatedAt: new Date().toISOString(),
    });
    return { complete: true, recipientCount: 0, push: { attempted: 0, accepted: 0, failed: 0 } };
  }

  const pageDocs = profiles.docs;
  const settingsSnapshots = await db.getAll(
    ...pageDocs.map((profile) => settingsRef(db, profile.id)),
  );
  const settingsByUser = new Map(
    pageDocs.map((profile, index) => [profile.id, settingsSnapshots[index]?.data() ?? {}]),
  );
  const eligible = [];
  for (const profile of pageDocs) {
    const data = profile.data() as Record<string, unknown>;
    const settings = settingsByUser.get(profile.id) ?? {};
    if (
      !excludedRoles.has(profile.id) &&
      !profileIsIneligible(data) &&
      categoryEnabled(String(announcement["category"] ?? "general"), preferencesFrom(settings)) &&
      (await profileMatchesAudience(
        audience,
        data,
        profile.id,
        (announcement["selectedUserIds"] ?? []) as string[],
        paidAudience,
      ))
    )
      eligible.push(profile);
  }

  const notificationRefs = eligible.map((profile) =>
    db
      .collection("users")
      .doc(profile.id)
      .collection("notifications")
      .doc(String(announcement["id"])),
  );
  const existing = notificationRefs.length ? await db.getAll(...notificationRefs) : [];
  const fresh = eligible.filter((_, index) => !existing[index]?.exists);
  const createdAt = new Date().toISOString();
  const writeBatch = db.batch();
  fresh.forEach((profile) => {
    const settings = settingsByUser.get(profile.id) ?? {};
    const optedIn = settings["pushEnabled"] === true;
    writeBatch.create(
      db
        .collection("users")
        .doc(profile.id)
        .collection("notifications")
        .doc(String(announcement["id"])),
      {
        id: String(announcement["id"]),
        announcementId: String(announcement["id"]),
        title: String(announcement["title"]),
        body: String(announcement["body"]),
        imageUrl: typeof announcement["imageUrl"] === "string" ? announcement["imageUrl"] : null,
        category: String(announcement["category"] ?? "general"),
        destination: String(announcement["destination"] ?? "/"),
        createdAt,
        readAt: null,
        pushStatus: optedIn ? "pending" : "not_opted_in",
      },
    );
  });
  if (fresh.length) await writeBatch.commit();

  // Delivery shares quiet hours, privacy, rate limiting and durable per-event claims.
  for (const profile of eligible) await deliverPendingNotifications(profile.id);
  const push = { attempted: 0, accepted: 0, failed: 0 };
  const deliveryRecords = notificationRefs.length ? await db.getAll(...notificationRefs) : [];
  for (const record of deliveryRecords) {
    push.accepted += Number(record.get("pushAcceptedTokens") ?? 0);
    push.failed += Number(record.get("pushFailedTokens") ?? 0);
  }
  push.attempted = push.accepted + push.failed;

  const lastProfileId = pageDocs[pageDocs.length - 1]?.id ?? null;
  const complete = pageDocs.length < PAGE_SIZE;
  const metrics = await campaignMetrics(db, String(announcement["id"]));
  await announcementRef.update({
    lastRecipientId: lastProfileId,
    ...metrics,
    status: complete ? "published" : "processing",
    ...(complete ? { publishedAt: new Date().toISOString() } : {}),
    leaseUntil: complete ? null : Date.now(),
    updatedAt: new Date().toISOString(),
  });
  return { complete, recipientCount: fresh.length, push };
}

export async function processAnnouncementBatch(id: string, options: { allowImmediate: boolean }) {
  const db = getFirebaseAdminFirestore();
  const announcement = await claimAnnouncement(id, options.allowImmediate);
  if (!announcement) return { claimed: false, status: "unchanged" as const };
  try {
    const result = await processRecipientPage(announcement);
    return {
      claimed: true,
      status: result.complete ? ("published" as const) : ("processing" as const),
      ...result,
    };
  } catch (error) {
    await db.collection("admin_announcements").doc(id).update({
      status: "failed",
      lastError: "Processing failed. Review server logs and retry.",
      leaseUntil: null,
      updatedAt: new Date().toISOString(),
    });
    throw error;
  }
}

export async function processDueAnnouncements() {
  const db = getFirebaseAdminFirestore();
  const now = Date.now();
  const [scheduled, continuing] = await Promise.all([
    db
      .collection("admin_announcements")
      .where("status", "==", "scheduled")
      .where("scheduleAt", "<=", new Date(now).toISOString())
      .orderBy("scheduleAt", "asc")
      .limit(4)
      .get(),
    db
      .collection("admin_announcements")
      .where("status", "==", "processing")
      .where("leaseUntil", "<=", now)
      .orderBy("leaseUntil", "asc")
      .limit(4)
      .get(),
  ]);
  const candidates = [...scheduled.docs, ...continuing.docs].slice(0, 4);
  const results = [];
  for (const announcement of candidates) {
    try {
      results.push(await processAnnouncementBatch(announcement.id, { allowImmediate: false }));
    } catch {
      results.push({ claimed: true, status: "failed" as const });
    }
  }
  return { processed: results.length, results };
}

export async function cancelScheduledAnnouncement(id: string) {
  const db = getFirebaseAdminFirestore();
  const ref = db.collection("admin_announcements").doc(id);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.get("status") !== "scheduled") return { cancelled: false };
    transaction.update(ref, {
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      leaseUntil: null,
      updatedAt: new Date().toISOString(),
    });
    return { cancelled: true };
  });
}

export function pushTokenId(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
