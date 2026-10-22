import { createHash } from "node:crypto";
import { getFirebaseAdminFirestore, getFirebaseAdminMessaging } from "@/server/firebase-admin";
import {
  categoryEnabled,
  inQuietHours,
  localClock,
  notificationChannel,
  preferencesFrom,
  safeNotificationDestination,
} from "@/lib/notification-policy";
import type { AnnouncementCategory, AnnouncementDestination } from "@/lib/notifications.types";

export type NotificationEvent = {
  eventId: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  destination: AnnouncementDestination;
};
export function eventDocumentId(eventId: string) {
  return createHash("sha256").update(eventId).digest("hex");
}
export async function createUserNotification(userId: string, event: NotificationEvent) {
  const db = getFirebaseAdminFirestore();
  const user = db.collection("users").doc(userId);
  const id = eventDocumentId(event.eventId);
  return db.runTransaction(async (tx) => {
    const ref = user.collection("notifications").doc(id);
    const [existing, settings, profile] = await Promise.all([
      tx.get(ref),
      tx.get(user.collection("notification_settings").doc("preferences")),
      tx.get(user),
    ]);
    if (
      existing.exists ||
      !profile.exists ||
      profile.get("disabled") === true ||
      profile.get("deleted") === true ||
      profile.get("account_disabled") === true
    )
      return false;
    const p = preferencesFrom(settings.data());
    if (!categoryEnabled(event.category, p)) return false;
    tx.create(ref, {
      ...event,
      id,
      announcementId: null,
      imageUrl: null,
      createdAt: new Date().toISOString(),
      readAt: null,
      pushStatus: p.pushEnabled ? "pending" : "not_opted_in",
    });
    return true;
  });
}

// Claim before contacting FCM: an ambiguous network failure is never resent blindly.
// FCM acceptance is recorded separately from device delivery, which FCM cannot guarantee.
export async function deliverPendingNotifications(userId: string, now = new Date()) {
  const db = getFirebaseAdminFirestore();
  const user = db.collection("users").doc(userId);
  const candidates = await user
    .collection("notifications")
    .where("pushStatus", "==", "pending")
    .limit(20)
    .get();
  for (const candidate of candidates.docs) {
    const delivery = await db.runTransaction(async (tx) => {
      const settingsRef = user.collection("notification_settings").doc("preferences");
      const [item, settings, profile, tokens] = await Promise.all([
        tx.get(candidate.ref),
        tx.get(settingsRef),
        tx.get(user),
        tx.get(user.collection("push_tokens").where("enabled", "==", true).limit(5)),
      ]);
      if (item.get("pushStatus") !== "pending") return null;
      const p = preferencesFrom(settings.data());
      if (
        !profile.exists ||
        profile.get("disabled") === true ||
        profile.get("deleted") === true ||
        profile.get("account_disabled") === true ||
        !p.pushEnabled ||
        !categoryEnabled(String(item.get("category")), p) ||
        item.get("dismissedAt")
      ) {
        tx.update(candidate.ref, { pushStatus: "not_opted_in" });
        return null;
      }
      if (now.getTime() - Date.parse(String(item.get("createdAt"))) > 48 * 60 * 60_000) {
        tx.update(candidate.ref, { pushStatus: "expired" });
        return null;
      }
      if (inQuietHours(p, now)) return null;
      const { date } = localClock(now, p.timeZone);
      const count = settings.get("pushDay") === date ? Number(settings.get("pushCount") ?? 0) : 0;
      if (count >= 4 || now.getTime() - Number(settings.get("lastPushAt") ?? 0) < 60 * 60_000)
        return null;
      const retryIds = item.get("retryTokenIds") as string[] | undefined;
      const activeTokens = retryIds
        ? tokens.docs.filter((t) => retryIds.includes(t.id))
        : tokens.docs;
      if (!activeTokens.length) {
        tx.update(candidate.ref, { pushStatus: "no_active_device" });
        return null;
      }
      tx.update(candidate.ref, { pushStatus: "attempted", pushAttemptedAt: now.toISOString() });
      tx.set(
        settingsRef,
        { pushDay: date, pushCount: count + 1, lastPushAt: now.getTime() },
        { merge: true },
      );
      return { item: item.data()!, tokens: activeTokens };
    });
    if (!delivery) continue;
    const { item, tokens } = delivery;
    try {
      const destination = safeNotificationDestination(item.destination);
      const origin = process.env.MEALMATE_APP_URL?.replace(/\/$/, "");
      const response = await getFirebaseAdminMessaging().sendEachForMulticast({
        tokens: tokens.map((t) => String(t.get("token"))),
        // Lock screens never show private meal, goal, billing or account details.
        notification: {
          title: "MealMate",
          body: "You have a new update. Open MealMate to view it.",
        },
        data: { notificationId: candidate.id, destination },
        android: {
          priority: "normal",
          notification: {
            channelId: notificationChannel(String(item.category)),
            tag: candidate.id,
            visibility: "private",
          },
        },
        webpush: {
          notification: { tag: candidate.id },
          ...(origin?.startsWith("https://")
            ? { fcmOptions: { link: `${origin}/notifications` } }
            : {}),
        },
      });
      const batch = db.batch();
      const retryTokenIds: string[] = [];
      response.responses.forEach((result, index) => {
        if (
          [
            "messaging/server-unavailable",
            "messaging/internal-error",
            "messaging/quota-exceeded",
          ].includes(result.error?.code ?? "")
        )
          retryTokenIds.push(tokens[index].id);
        if (
          [
            "messaging/registration-token-not-registered",
            "messaging/invalid-registration-token",
          ].includes(result.error?.code ?? "")
        )
          batch.delete(tokens[index].ref);
      });
      batch.update(candidate.ref, {
        pushStatus: response.successCount ? "accepted" : "failed",
        pushAcceptedTokens: Number(item.pushAcceptedTokens ?? 0) + response.successCount,
        pushFailedTokens: response.failureCount,
        retryTokenIds,
      });
      await batch.commit();
    } catch {
      await candidate.ref.update({
        pushStatus: "failed",
        pushError:
          "FCM did not confirm acceptance. Open the notification centre to read this update.",
      });
    }
  }
}
