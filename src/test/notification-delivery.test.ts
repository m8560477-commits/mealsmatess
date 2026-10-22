import { beforeEach, describe, expect, it, vi } from "vitest";
import { firestoreFixture } from "./firestore-fixture";
import {
  createUserNotification,
  deliverPendingNotifications,
  eventDocumentId,
} from "@/server/user-notifications";
const mocks = vi.hoisted(() => ({ db: null as any, send: vi.fn() }));
vi.mock("@/server/firebase-admin", () => ({
  getFirebaseAdminFirestore: () => mocks.db,
  getFirebaseAdminMessaging: () => ({ sendEachForMulticast: mocks.send }),
}));
let fixture: ReturnType<typeof firestoreFixture>;
const event = {
  eventId: "real-event-id-in-test",
  category: "account" as const,
  title: "Private account details",
  body: "Sensitive test-only content",
  destination: "/profile" as const,
};
const itemPath = () => `users/user/notifications/${eventDocumentId(event.eventId)}`;
beforeEach(() => {
  fixture = firestoreFixture();
  mocks.db = fixture.db;
  mocks.send.mockReset();
  fixture.records.set("users/user", { id: "user" });
  fixture.records.set("users/user/notification_settings/preferences", {
    pushEnabled: true,
    quietHoursEnabled: false,
  });
  fixture.records.set("users/user/push_tokens/device", {
    enabled: true,
    token: "synthetic-fcm-token",
  });
  mocks.send.mockResolvedValue({
    successCount: 1,
    failureCount: 0,
    responses: [{ success: true }],
  });
});
describe("durable push delivery", () => {
  it("deduplicates event creation and concurrent delivery attempts", async () => {
    expect(
      await Promise.all([
        createUserNotification("user", event),
        createUserNotification("user", event),
      ]),
    ).toEqual([true, false]);
    await Promise.all([deliverPendingNotifications("user"), deliverPendingNotifications("user")]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(fixture.records.get(itemPath())?.pushStatus).toBe("accepted");
  });
  it("never sends private content to the lock screen", async () => {
    await createUserNotification("user", event);
    await deliverPendingNotifications("user");
    const payload = mocks.send.mock.calls[0][0];
    expect(JSON.stringify(payload)).not.toContain(event.body);
    expect(payload.android.notification).toMatchObject({
      channelId: "account",
      visibility: "private",
    });
    expect(payload.data.destination).toBe("/profile");
  });
  it("defers quiet hours and then releases eligible messages", async () => {
    fixture.records.get("users/user/notification_settings/preferences")!.quietHoursEnabled = true;
    await createUserNotification("user", event);
    await deliverPendingNotifications(
      "user",
      new Date(new Date().toISOString().slice(0, 10) + "T22:00:00Z"),
    );
    expect(mocks.send).not.toHaveBeenCalled();
    await deliverPendingNotifications(
      "user",
      new Date(new Date().toISOString().slice(0, 10) + "T12:00:00Z"),
    );
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("respects consent changes, rate caps and disabled accounts", async () => {
    await createUserNotification("user", event);
    const p = fixture.records.get("users/user/notification_settings/preferences")!;
    p.lastPushAt = Date.now();
    await deliverPendingNotifications("user");
    expect(mocks.send).not.toHaveBeenCalled();
    p.pushEnabled = false;
    await deliverPendingNotifications("user");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(fixture.records.get(itemPath())?.pushStatus).toBe("not_opted_in");
    fixture.records.get("users/user")!.disabled = true;
    expect(await createUserNotification("user", { ...event, eventId: "another" })).toBe(false);
  });
  it("invalidates rejected tokens and does not retry ambiguous failures", async () => {
    mocks.send.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      responses: [
        { success: false, error: { code: "messaging/registration-token-not-registered" } },
      ],
    });
    await createUserNotification("user", event);
    await deliverPendingNotifications("user");
    expect(fixture.records.has("users/user/push_tokens/device")).toBe(false);
    expect(fixture.records.get(itemPath())?.pushStatus).toBe("failed");
    await deliverPendingNotifications("user");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("records missing devices without claiming acceptance", async () => {
    fixture.records.delete("users/user/push_tokens/device");
    await createUserNotification("user", event);
    await deliverPendingNotifications("user");
    expect(fixture.records.get(itemPath())?.pushStatus).toBe("no_active_device");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
