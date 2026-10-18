import { createHash, randomUUID } from "node:crypto";
import { FieldPath, FieldValue, type Firestore } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore, getFirebaseAdminMessaging } from "@/server/firebase-admin";
import { isHealthyInterest } from "@/lib/notification-segments";
import type { AnnouncementAudience, AnnouncementInput } from "@/lib/notifications.types";

const PAGE_SIZE = 250;
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

function profileMatchesAudience(audience: AnnouncementAudience, profile: Record<string, unknown>) {
  return audience === "all_consumers" || isHealthyInterest(profile);
}

function consumerRoleExclusions(db: Firestore) {
  return db.collection("user_roles").get().then((snapshot) => {
    const excluded = new Set<string>();
    for (const document of snapshot.docs) {
      const role = String(document.get("role") ?? "").toLowerCase();
      const userId = String(document.get("user_id") ?? "");
      if (userId && EXCLUDED_ROLES.has(role)) excluded.add(userId);
    }
    return excluded;
  });
}

function appBaseUrl() {
  const configured = process.env["MEALMATE_APP_URL"]?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = process.env["VERCEL_URL"]?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;
  return "http://localhost:3000";
}

export async function previewAudience(audience: AnnouncementAudience) {
  const db = getFirebaseAdminFirestore();
  const [profiles, excludedRoles] = await Promise.all([
    db.collection("users").get(),
    consumerRoleExclusions(db),
  ]);
  const settings = profiles.empty
    ? []
    : await db.getAll(...profiles.docs.map((profile) => settingsRef(db, profile.id)));
  const settingsByUser = new Map(
    settings.map((snapshot) => [snapshot.ref.parent.parent?.id ?? "", snapshot.data() ?? {}]),
  );
  let count = 0;
  for (const profileDoc of profiles.docs) {
    const profile = profileDoc.data() as Record<string, unknown>;
    const preferences = settingsByUser.get(profileDoc.id) ?? {};
    if (
      !excludedRoles.has(profileDoc.id) &&
      !profileIsIneligible(profile) &&
      preferences["productUpdatesEnabled"] !== false &&
      profileMatchesAudience(audience, profile)
    ) count += 1;
  }
  return { count, audience };
}

export async function saveAnnouncement(input: AnnouncementInput, actorId: string) {
  const db = getFirebaseAdminFirestore();
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

async function sendPushBatch(
  db: Firestore,
  tokens: { token: string; ref: FirebaseFirestore.DocumentReference; userId: string }[],
  announcement: Record<string, unknown>,
) {
  if (tokens.length === 0) return { attempted: 0, accepted: 0, failed: 0 };
  const messaging = getFirebaseAdminMessaging();
  const perUser = new Map<string, { accepted: number; failed: number }>();
  const tokenResults: { token: (typeof tokens)[number]; accepted: boolean; stale: boolean }[] = [];
  const destination = String(announcement["destination"] ?? "/");
  const vercelUrl = process.env["VERCEL_URL"]?.trim();
  const appUrl = process.env["MEALMATE_APP_URL"]?.trim()?.replace(/\/$/, "") ??
    (vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000");

  for (let offset = 0; offset < tokens.length; offset += 500) {
    const chunk = tokens.slice(offset, offset + 500);
    const response = await messaging.sendEachForMulticast({
      tokens: chunk.map((entry) => entry.token),
      data: { announcementId: String(announcement["id"]), destination },
      webpush: {
        notification: {
          title: String(announcement["title"]),
          body: String(announcement["body"]),
          ...(typeof announcement["imageUrl"] === "string" && announcement["imageUrl"]
            ? { image: String(announcement["imageUrl"]) }
            : {}),
        },
        fcmOptions: { link: `${appUrl}${destination}` },
      },
    });
    response.responses.forEach((result, index) => {
      const token = chunk[index];
      if (!token) return;
      const code = result.error?.code ?? "";
      const stale = code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token";
      tokenResults.push({ token, accepted: result.success, stale });
      const counts = perUser.get(token.userId) ?? { accepted: 0, failed: 0 };
      if (result.success) counts.accepted += 1;
      else counts.failed += 1;
      perUser.set(token.userId, counts);
    });
  }

  const batch = db.batch();
  for (const result of tokenResults) {
    if (result.accepted) batch.set(result.token.ref, { lastAcceptedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    else if (result.stale) batch.delete(result.token.ref);
  }
  for (const [userId, counts] of perUser) {
    const notificationRef = db.collection("users").doc(userId).collection("notifications").doc(String(announcement["id"]));
    batch.set(notificationRef, {
      pushStatus: counts.accepted > 0 ? "accepted" : "failed",
      pushAcceptedTokens: counts.accepted,
      pushFailedTokens: counts.failed,
    }, { merge: true });
  }
  await batch.commit();
  const accepted = tokenResults.filter((result) => result.accepted).length;
  return { attempted: tokenResults.length, accepted, failed: tokenResults.length - accepted };
}

async function processRecipientPage(announcement: Record<string, unknown>) {
  const db = getFirebaseAdminFirestore();
  const audience = String(announcement["audience"] ?? "all_consumers") as AnnouncementAudience;
  let query = db.collection("users").orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
  const lastRecipientId = typeof announcement["lastRecipientId"] === "string" ? announcement["lastRecipientId"] : null;
  if (lastRecipientId) query = query.startAfter(lastRecipientId);
  const [profiles, excludedRoles] = await Promise.all([query.get(), consumerRoleExclusions(db)]);
  const announcementRef = db.collection("admin_announcements").doc(String(announcement["id"]));
  if (profiles.empty) {
    await announcementRef.update({ status: "published", publishedAt: new Date().toISOString(), leaseUntil: null, updatedAt: new Date().toISOString() });
    return { complete: true, recipientCount: 0, push: { attempted: 0, accepted: 0, failed: 0 } };
  }

  const pageDocs = profiles.docs;
  const settingsSnapshots = await db.getAll(...pageDocs.map((profile) => settingsRef(db, profile.id)));
  const settingsByUser = new Map(pageDocs.map((profile, index) => [profile.id, settingsSnapshots[index]?.data() ?? {}]));
  const eligible = pageDocs.filter((profile) => {
    const data = profile.data() as Record<string, unknown>;
    const settings = settingsByUser.get(profile.id) ?? {};
    return !excludedRoles.has(profile.id) && !profileIsIneligible(data) &&
      settings["productUpdatesEnabled"] !== false && profileMatchesAudience(audience, data);
  });

  const notificationRefs = eligible.map((profile) => db.collection("users").doc(profile.id).collection("notifications").doc(String(announcement["id"])));
  const existing = notificationRefs.length ? await db.getAll(...notificationRefs) : [];
  const fresh = eligible.filter((_, index) => !existing[index]?.exists);
  const createdAt = new Date().toISOString();
  const writeBatch = db.batch();
  fresh.forEach((profile) => {
    const settings = settingsByUser.get(profile.id) ?? {};
    const optedIn = settings["pushEnabled"] === true;
    writeBatch.create(
      db.collection("users").doc(profile.id).collection("notifications").doc(String(announcement["id"])),
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

  const pushUsers = fresh.filter((profile) => settingsByUser.get(profile.id)?.["pushEnabled"] === true);
  const tokenSnapshots = await Promise.all(pushUsers.map((profile) =>
    db.collection("users").doc(profile.id).collection("push_tokens").limit(5).get(),
  ));
  const tokens = tokenSnapshots.flatMap((snapshot, index) => snapshot.docs.map((tokenDoc) => ({
    userId: pushUsers[index]!.id,
    token: String(tokenDoc.get("token") ?? ""),
    ref: tokenDoc.ref,
  })).filter((item) => item.token.length > 0));

  if (pushUsers.length) {
    const noDevice = pushUsers.filter((user, index) => tokenSnapshots[index]?.empty);
    const noDeviceBatch = db.batch();
    noDevice.forEach((user) => noDeviceBatch.set(
      db.collection("users").doc(user.id).collection("notifications").doc(String(announcement["id"])),
      { pushStatus: "no_active_device" }, { merge: true },
    ));
    if (noDevice.length) await noDeviceBatch.commit();
  }

  if (tokens.length) {
    const attemptBatch = db.batch();
    [...new Set(tokens.map((item) => item.userId))].forEach((userId) => attemptBatch.set(
      db.collection("users").doc(userId).collection("notifications").doc(String(announcement["id"])),
      { pushStatus: "attempted", pushAttemptedAt: createdAt }, { merge: true },
    ));
    await attemptBatch.commit();
  }

  let push = { attempted: 0, accepted: 0, failed: 0 };
  if (tokens.length) {
    try {
      push = await sendPushBatch(db, tokens, announcement);
    } catch {
      const failedBatch = db.batch();
      [...new Set(tokens.map((item) => item.userId))].forEach((userId) => failedBatch.set(
        db.collection("users").doc(userId).collection("notifications").doc(String(announcement["id"])),
        { pushStatus: "failed", pushAttemptedAt: createdAt, pushFailedTokens: tokens.filter((item) => item.userId === userId).length },
        { merge: true },
      ));
      await failedBatch.commit();
      push = { attempted: tokens.length, accepted: 0, failed: tokens.length };
    }
  }

  const lastProfileId = pageDocs[pageDocs.length - 1]?.id ?? null;
  const complete = pageDocs.length < PAGE_SIZE;
  await announcementRef.update({
    lastRecipientId: lastProfileId,
    recipientCount: FieldValue.increment(fresh.length),
    pushAttemptedTokens: FieldValue.increment(push.attempted),
    pushAcceptedTokens: FieldValue.increment(push.accepted),
    pushFailedTokens: FieldValue.increment(push.failed),
    status: complete ? "published" : "processing",
    ...(complete ? { publishedAt: new Date().toISOString() } : {}),
    leaseUntil: null,
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
    return { claimed: true, status: result.complete ? "published" as const : "processing" as const, ...result };
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
  const snapshot = await db.collection("admin_announcements").where("status", "in", ["scheduled", "processing"]).limit(40).get();
  const now = Date.now();
  const candidates = snapshot.docs.filter((document) => {
    const record = document.data();
    if (record["status"] === "scheduled") {
      const scheduleAt = Date.parse(String(record["scheduleAt"] ?? ""));
      return Number.isFinite(scheduleAt) && scheduleAt <= now;
    }
    return Number(record["leaseUntil"] ?? 0) <= now;
  }).slice(0, 4);
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
    transaction.update(ref, { status: "cancelled", cancelledAt: new Date().toISOString(), leaseUntil: null, updatedAt: new Date().toISOString() });
    return { cancelled: true };
  });
}

export function pushTokenId(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
