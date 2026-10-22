import {
  notificationPreferencesSchema,
  preferencesFrom,
  safeNotificationDestination,
} from "@/lib/notification-policy";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { loadFirebaseAdmin } from "@/lib/firebase-admin-access";
import type { AnnouncementInput } from "@/lib/notifications.types";

async function assertAdmin(userId: string) {
  const { firebaseAdmin } = await loadFirebaseAdmin();
  const { data, error } = await firebaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Response("Forbidden", { status: 403 });
}

async function setNotificationReadStatus(userId: string, id: string, read: boolean) {
  const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
  const db = getFirebaseAdminFirestore();
  const notificationRef = db.collection("users").doc(userId).collection("notifications").doc(id);
  await db.runTransaction(async (transaction) => {
    const notification = await transaction.get(notificationRef);
    if (!notification.exists) throw new Response("Notification not found", { status: 404 });
    const wasRead = notification.get("readAt") != null;
    if (wasRead === read) return;
    const announcementId = notification.get("announcementId");
    const announcementRef =
      typeof announcementId === "string"
        ? db.collection("admin_announcements").doc(announcementId)
        : null;
    const announcement = announcementRef ? await transaction.get(announcementRef) : null;
    const currentCount = announcement?.exists
      ? Math.max(0, Number(announcement.get("readCount") ?? 0))
      : 0;
    transaction.update(notificationRef, { readAt: read ? new Date().toISOString() : null });
    if (announcementRef && announcement?.exists) {
      transaction.update(announcementRef, {
        readCount: Math.max(0, currentCount + (read ? 1 : -1)),
      });
    }
  });
  return { ok: true };
}

const announcementInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(2000),
  imageUrl: z
    .string()
    .url()
    .max(2048)
    .refine((value) => value.startsWith("https://"), "Image URL must use HTTPS.")
    .nullable()
    .optional()
    .transform((value) => value || null),
  category: z.enum([
    "recipes",
    "healthy_eating",
    "dining",
    "mia",
    "features",
    "general",
    "meal_planning",
    "pantry_shopping",
    "promotions",
    "account",
  ]),
  audience: z.enum(["all_consumers", "healthy_interest", "premium", "trial", "selected"]),
  destination: z
    .string()
    .max(180)
    .refine(
      (value) => safeNotificationDestination(value) === value,
      "Choose a supported MealMate destination.",
    )
    .transform((value) => value as AnnouncementInput["destination"]),
  selectedUsers: z.array(z.string().trim().min(1).max(254)).max(100).optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional().default(null),
  status: z.enum(["draft", "scheduled"]),
});

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
    const collection = getFirebaseAdminFirestore()
      .collection("users")
      .doc(context.userId)
      .collection("notifications");
    const [items, unread] = await Promise.all([
      collection.orderBy("createdAt", "desc").limit(100).get(),
      collection.where("readAt", "==", null).count().get(),
    ]);
    return {
      items: items.docs
        .filter((doc) => !doc.get("dismissedAt"))
        .map((document) => ({ id: document.id, ...document.data() })),
      unreadCount: unread.data().count,
    };
  });

export const getMyUnreadNotificationCount = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
    const collection = getFirebaseAdminFirestore()
      .collection("users")
      .doc(context.userId)
      .collection("notifications");
    const unread = await collection.where("readAt", "==", null).count().get();
    return { unreadCount: unread.data().count };
  });

export const setMyNotificationReadStatus = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((value: unknown) =>
    z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), read: z.boolean() }).parse(value),
  )
  .handler(async ({ data, context }) =>
    setNotificationReadStatus(context.userId, data.id, data.read),
  );

export const markAllMyNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
    const collection = getFirebaseAdminFirestore()
      .collection("users")
      .doc(context.userId)
      .collection("notifications");
    let updated = 0;
    while (true) {
      const unread = await collection.where("readAt", "==", null).limit(100).get();
      if (unread.empty) break;
      for (const notification of unread.docs) {
        await setNotificationReadStatus(context.userId, notification.id, true);
        updated += 1;
      }
    }
    return { updated };
  });

export const getMyNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
    const ref = getFirebaseAdminFirestore()
      .collection("users")
      .doc(context.userId)
      .collection("notification_settings")
      .doc("preferences");
    const snapshot = await ref.get();
    const data = snapshot.data() ?? {};
    return preferencesFrom(data);
  });

export const saveMyNotificationPreferences = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((value: unknown) => notificationPreferencesSchema.partial().parse(value))
  .handler(async ({ data, context }) => {
    const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
    const db = getFirebaseAdminFirestore();
    const settings = db
      .collection("users")
      .doc(context.userId)
      .collection("notification_settings")
      .doc("preferences");
    const previous = await settings.get();
    const previousPushEnabled = previous.get("pushEnabled") === true;
    const next = preferencesFrom({ ...previous.data(), ...data });
    const pushEnabled = next.pushEnabled;
    const consentChange =
      pushEnabled === previousPushEnabled
        ? {}
        : pushEnabled
          ? { pushConsentAt: new Date().toISOString() }
          : { pushConsentRevokedAt: new Date().toISOString() };
    await settings.set(
      {
        ...next,
        updatedAt: new Date().toISOString(),
        ...consentChange,
      },
      { merge: true },
    );
    if (!pushEnabled) {
      const tokens = await db
        .collection("users")
        .doc(context.userId)
        .collection("push_tokens")
        .get();
      for (let offset = 0; offset < tokens.docs.length; offset += 400) {
        const batch = db.batch();
        tokens.docs.slice(offset, offset + 400).forEach((token) => batch.delete(token.ref));
        await batch.commit();
      }
    }
    return next;
  });

export const registerMyPushToken = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((value: unknown) => z.object({ token: z.string().min(40).max(4096) }).parse(value))
  .handler(async ({ data, context }) => {
    const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
    const db = getFirebaseAdminFirestore();
    const userRef = db.collection("users").doc(context.userId);
    const settings = await userRef.collection("notification_settings").doc("preferences").get();
    if (settings.get("pushEnabled") !== true) {
      throw new Response("Push consent is required before registering a device.", { status: 403 });
    }
    const { pushTokenId } = await import("@/server/notification-delivery");
    const tokenRef = userRef.collection("push_tokens").doc(pushTokenId(data.token));
    const ownerRef = db.collection("push_token_owners").doc(tokenRef.id);
    await db.runTransaction(async (transaction) => {
      const [owner, consent, existingTokens] = await Promise.all([
        transaction.get(ownerRef),
        transaction.get(userRef.collection("notification_settings").doc("preferences")),
        transaction.get(userRef.collection("push_tokens")),
      ]);
      if (consent.get("pushEnabled") !== true)
        throw new Response("Push consent required", { status: 403 });
      const previousUser = owner.get("userId");
      if (typeof previousUser === "string" && previousUser !== context.userId) {
        transaction.delete(
          db.collection("users").doc(previousUser).collection("push_tokens").doc(tokenRef.id),
        );
      }
      if (existingTokens.size >= 5 && !existingTokens.docs.some((doc) => doc.id === tokenRef.id)) {
        throw new Response("Maximum of five registered devices reached.", { status: 429 });
      }
      transaction.set(ownerRef, { userId: context.userId });
      transaction.set(tokenRef, {
        token: data.token,
        enabled: true,
        updatedAt: new Date().toISOString(),
      });
    });
    return { registered: true };
  });

export const previewAnnouncementAudience = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((value: unknown) =>
    z
      .object({
        audience: z.enum(["all_consumers", "healthy_interest", "premium", "trial", "selected"]),
        category: z.string(),
        selectedUsers: z.array(z.string().min(1).max(254)).max(100).optional(),
      })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { previewAudience } = await import("@/server/notification-delivery");
    return previewAudience(data.audience, data.category, data.selectedUsers);
  });

export const listAdminAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
    const snapshot = await getFirebaseAdminFirestore()
      .collection("admin_announcements")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    return Promise.all(
      snapshot.docs.map(async (document) => {
        const { campaignMetrics } = await import("@/server/notification-metrics");
        return {
          id: document.id,
          ...document.data(),
          ...(await campaignMetrics(getFirebaseAdminFirestore(), document.id)),
        };
      }),
    );
  });

export const saveAdminAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((value: unknown) => announcementInput.parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.destination.startsWith("/recipe/")) {
      const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
      const recipe = await getFirebaseAdminFirestore()
        .collection("recipes")
        .where("slug", "==", data.destination.slice(8))
        .limit(1)
        .get();
      if (recipe.empty) throw new Error("Recipe not found.");
    }
    const { saveAnnouncement } = await import("@/server/notification-delivery");
    return saveAnnouncement(data as AnnouncementInput, context.userId);
  });

export const publishAdminAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((value: unknown) => z.object({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { processAnnouncementBatch } = await import("@/server/notification-delivery");
    const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
    await getFirebaseAdminFirestore()
      .collection("admin_announcements")
      .doc(data.id)
      .update({ sentBy: context.userId, sendRequestedAt: new Date().toISOString() });
    return processAnnouncementBatch(data.id, { allowImmediate: true });
  });

export const cancelAdminAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((value: unknown) => z.object({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { cancelScheduledAnnouncement } = await import("@/server/notification-delivery");
    return cancelScheduledAnnouncement(data.id);
  });

export const unregisterMyPushToken = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((value: unknown) => z.object({ token: z.string().min(40).max(4096) }).parse(value))
  .handler(async ({ data, context }) => {
    const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
    const { pushTokenId } = await import("@/server/notification-delivery");
    const db = getFirebaseAdminFirestore();
    const id = pushTokenId(data.token);
    await db.runTransaction(async (tx) => {
      const owner = db.collection("push_token_owners").doc(id);
      const snapshot = await tx.get(owner);
      tx.delete(db.collection("users").doc(context.userId).collection("push_tokens").doc(id));
      if (snapshot.get("userId") === context.userId) tx.delete(owner);
    });
    return { removed: true };
  });

// Keep a tombstone so dismissed event IDs can never be delivered again.
export const clearMyNotification = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((value: unknown) =>
    z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/) }).parse(value),
  )
  .handler(async ({ data, context }) => {
    await setNotificationReadStatus(context.userId, data.id, true);
    const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
    await getFirebaseAdminFirestore()
      .collection("users")
      .doc(context.userId)
      .collection("notifications")
      .doc(data.id)
      .update({ dismissedAt: new Date().toISOString(), pushStatus: "dismissed" });
    return { cleared: true };
  });

export const retryAdminAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((value: unknown) => z.object({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
    const db = getFirebaseAdminFirestore();
    const records = await db
      .collectionGroup("notifications")
      .where("announcementId", "==", data.id)
      .where("pushStatus", "in", ["failed", "accepted"])
      .get();
    const { deliverPendingNotifications } = await import("@/server/user-notifications");
    let queued = 0;
    for (const record of records.docs) {
      const retry = await db.runTransaction(async (tx) => {
        const current = await tx.get(record.ref);
        if (
          !["failed", "accepted"].includes(current.get("pushStatus")) ||
          !current.get("retryTokenIds")?.length ||
          current.get("dismissedAt")
        )
          return false;
        tx.update(record.ref, { pushStatus: "pending", retryRequestedBy: context.userId });
        return true;
      });
      if (retry) {
        queued++;
        await deliverPendingNotifications(record.ref.parent.parent!.id);
      }
    }
    return { queued };
  });
