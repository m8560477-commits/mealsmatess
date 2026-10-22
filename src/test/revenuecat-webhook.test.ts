import { beforeEach, expect, it, vi } from "vitest";
import { firestoreFixture } from "./firestore-fixture";
import { processRevenueCatEvent } from "@/server/revenuecat-webhook";
const mocks = vi.hoisted(() => ({
  db: null as any,
  access: vi.fn(),
  user: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/server/firebase-admin", () => ({
  getFirebaseAdminFirestore: () => mocks.db,
  getFirebaseAdminAuth: () => ({ getUser: mocks.user }),
}));
vi.mock("@/server/entitlements", () => ({ resolveEntitlement: mocks.access }));
vi.mock("@/server/user-notifications", () => ({
  eventDocumentId: (value: string) => value.replaceAll(":", "_"),
  createUserNotification: mocks.notify,
}));
let fixture: ReturnType<typeof firestoreFixture>;
const event = {
  id: "event-test",
  app_user_id: "uid",
  type: "CANCELLATION",
  environment: "PRODUCTION",
};
beforeEach(() => {
  vi.clearAllMocks();
  fixture = firestoreFixture();
  mocks.db = fixture.db;
  vi.stubEnv("REVENUECAT_ENVIRONMENT", "PRODUCTION");
  vi.stubEnv("REVENUECAT_SECRET_API_KEY", "test-only-secret");
  vi.stubEnv("REVENUECAT_ENTITLEMENT_ID", "premium");
  mocks.user.mockResolvedValue({ disabled: false });
  mocks.access.mockResolvedValue({
    isPremium: true,
    tier: "premium",
    status: "active",
    trialActive: false,
    periodEnd: "2026-12-01",
    trialEnd: null,
    autoRenew: false,
    store: "play_store",
  });
});
it("preserves active access on cancellation and deduplicates retries", async () => {
  expect(await processRevenueCatEvent(event)).toBe("ok");
  expect(await processRevenueCatEvent(event)).toBe("Duplicate");
  expect(mocks.access).toHaveBeenCalledExactlyOnceWith("uid", true, true);
  expect(fixture.records.get("subscriptions/paid_uid")?.status).toBe("active");
  expect(mocks.notify).toHaveBeenCalledOnce();
});
it("blocks other environments and malformed identities", async () => {
  expect(await processRevenueCatEvent({ ...event, environment: "SANDBOX" })).toContain("Ignored");
  expect(mocks.access).not.toHaveBeenCalled();
  await expect(processRevenueCatEvent({ ...event, app_user_id: "bad/path" })).rejects.toThrow();
});
it("releases failed claims for retry without marking successful processing", async () => {
  mocks.access.mockRejectedValueOnce(new Error("network"));
  await expect(processRevenueCatEvent(event)).rejects.toThrow("network");
  expect(fixture.records.get("subscription_events/revenuecat_event-test")?.processed).toBe(false);
  expect(await processRevenueCatEvent(event)).toBe("ok");
});

it("acknowledges deleted or anonymous accounts without endless retries", async () => {
  mocks.user.mockRejectedValue({ code: "auth/user-not-found" });
  expect(await processRevenueCatEvent(event)).toBe("Ignored unknown account");
  expect(mocks.access).not.toHaveBeenCalled();
});

it("accepts nullable provider metadata without inventing a payment", async () => {
  expect(
    await processRevenueCatEvent({
      ...event,
      entitlement_ids: null,
      product_id: null,
      currency: null,
      price_in_purchased_currency: null,
      purchased_at_ms: null,
    }),
  ).toBe("ok");
  expect([...fixture.records.keys()].some((key) => key.startsWith("payments/"))).toBe(false);
});
