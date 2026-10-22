import { beforeEach, expect, it, vi } from "vitest";
import { firestoreFixture } from "./firestore-fixture";
import { processNotificationReminders } from "@/server/notification-reminders";
const mocks = vi.hoisted(() => ({ db: null as any, create: vi.fn(), deliver: vi.fn() }));
vi.mock("@/server/firebase-admin", () => ({ getFirebaseAdminFirestore: () => mocks.db }));
vi.mock("@/server/user-notifications", () => ({
  createUserNotification: mocks.create,
  deliverPendingNotifications: mocks.deliver,
}));
let fixture: ReturnType<typeof firestoreFixture>;
beforeEach(() => {
  fixture = firestoreFixture();
  mocks.db = fixture.db;
  vi.clearAllMocks();
  fixture.records.set("users/user", { preferences: { goal: "Plan meals" } });
  fixture.records.set("users/user/notification_settings/preferences", {
    mealPlanningEnabled: true,
    pantryShoppingEnabled: true,
    reminderTime: "09:00",
    timeZone: "Africa/Johannesburg",
  });
});
it("uses saved local-date meals and shopping records after the selected time", async () => {
  fixture.records.set("users/user/mealPlans/meal", { plan_date: "2026-10-22" });
  fixture.records.set("users/user/grocery/item", { checked: false });
  await processNotificationReminders(new Date("2026-10-22T06:59:00Z"));
  expect(mocks.create).not.toHaveBeenCalled();
  await processNotificationReminders(new Date("2026-10-22T07:00:00Z"));
  expect(mocks.create).toHaveBeenCalledWith(
    "user",
    expect.objectContaining({ eventId: "planned-meals:2026-10-22" }),
  );
  expect(mocks.create).toHaveBeenCalledWith(
    "user",
    expect.objectContaining({ eventId: "shopping:2026-10-22" }),
  );
  expect(mocks.create.mock.calls.some((call) => call[1].category === "healthy_eating")).toBe(false);
});
it("does not invent pantry expiries or planned meals and honours worker leases", async () => {
  await processNotificationReminders(new Date("2026-10-22T12:00:00Z"));
  expect(mocks.create).not.toHaveBeenCalled();
  fixture.records.set("notification_jobs/reminders", {
    leaseUntil: Date.parse("2026-10-22T12:10:00Z"),
  });
  expect(await processNotificationReminders(new Date("2026-10-22T12:01:00Z"))).toEqual({
    processed: 0,
    busy: true,
  });
});
