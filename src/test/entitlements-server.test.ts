import { beforeEach, expect, it, vi } from "vitest";
import { firestoreFixture } from "./firestore-fixture";
import { emailGrantId, resolveEntitlement, premiumForUsage } from "@/server/entitlements";
const mocks = vi.hoisted(() => ({ db: null as any, user: vi.fn(), legacy: vi.fn() }));
vi.mock("@/server/firebase-admin", () => ({
  getFirebaseAdminFirestore: () => mocks.db,
  getFirebaseAdminAuth: () => ({ getUser: mocks.user }),
  firebaseAdmin: {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        then: (resolve: (v: any) => void) => resolve(mocks.legacy()),
      };
      return q;
    },
  },
}));
let fixture: ReturnType<typeof firestoreFixture>;
beforeEach(() => {
  fixture = firestoreFixture();
  mocks.db = fixture.db;
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ email: "MEMBER@example.test", emailVerified: true });
  mocks.legacy.mockReturnValue({ data: [], error: null });
  vi.stubEnv("REVENUECAT_SECRET_API_KEY", "");
  vi.stubEnv("REVENUECAT_ENTITLEMENT_ID", "premium");
});
it("matches only verified normalized account email and observes revocation immediately", async () => {
  const id = emailGrantId(" member@EXAMPLE.test ");
  expect(id).toBe(emailGrantId("MEMBER@example.test"));
  fixture.records.set(`premium_email_grants/${id}`, { expiresAt: "2099-01-01" });
  expect((await resolveEntitlement("uid")).isPremium).toBe(true);
  mocks.user.mockResolvedValue({ email: "member@example.test", emailVerified: false });
  await expect(resolveEntitlement("uid")).rejects.toThrow(/not configured/);
  mocks.user.mockResolvedValue({ email: "member@example.test", emailVerified: true });
  fixture.records.get(`premium_email_grants/${id}`)!.revoked = true;
  await expect(resolveEntitlement("uid")).rejects.toThrow(/not configured/);
});
it("never accepts expired cached paid entitlements on a network failure", async () => {
  vi.stubEnv("REVENUECAT_SECRET_API_KEY", "synthetic-secret");
  fixture.records.set("revenuecat_entitlements/uid", {
    checkedAt: Date.now(),
    entitlementId: "premium",
    access: {
      isPremium: true,
      tier: "premium",
      status: "active",
      trialActive: false,
      periodEnd: "2020-01-01",
      trialEnd: null,
      store: "play_store",
      autoRenew: true,
      isManual: false,
    },
  });
  const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetcher);
  await expect(resolveEntitlement("uid")).rejects.toThrow(/Could not verify/);
  vi.unstubAllGlobals();
});

it("falls back to free allowance when verification is unavailable", async () => {
  mocks.user.mockRejectedValue(new Error("Auth unavailable"));
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(await premiumForUsage("uid")).toBe(false);
  warning.mockRestore();
});

it("reports missing billing configuration without granting paid access", async () => {
  await expect(resolveEntitlement("uid")).rejects.toThrow(/not configured/);
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(await premiumForUsage("uid")).toBe(false);
  warning.mockRestore();
});
