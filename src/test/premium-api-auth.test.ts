import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateApiRequest } from "@/server/authenticated-api";
const mocks = vi.hoisted(() => ({ token: vi.fn(), premium: vi.fn(), db: vi.fn() }));
vi.mock("@/server/firebase-admin", () => ({
  verifyFirebaseIdToken: mocks.token,
  firebaseUserDb: mocks.db,
}));
vi.mock("@/server/revenuecat", () => ({ requireActivePremium: mocks.premium }));
const request = (token = "valid") =>
  new Request("https://mealsmates.site/api/mia", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "synthetic-present");
  mocks.token.mockResolvedValue({ uid: "account" });
  mocks.premium.mockResolvedValue({ isPremium: true });
});
afterEach(() => vi.unstubAllEnvs());
describe("AI API identity and subscription boundary", () => {
  it("rejects anonymous and invalid tokens before checking purchases", async () => {
    expect((await authenticateApiRequest(request(""))).response?.status).toBe(401);
    mocks.token.mockRejectedValue(new Error("invalid"));
    expect((await authenticateApiRequest(request())).response?.status).toBe(401);
    expect(mocks.premium).not.toHaveBeenCalled();
  });
  it("rejects unpaid identities and fails closed on verification outages", async () => {
    mocks.premium.mockRejectedValue(new Response("payment required", { status: 402 }));
    expect((await authenticateApiRequest(request())).response?.status).toBe(402);
    mocks.premium.mockRejectedValue(new Error("offline"));
    expect((await authenticateApiRequest(request())).response?.status).toBe(503);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("makes the authenticated database available only after RevenueCat confirmation", async () => {
    const result = await authenticateApiRequest(request());
    expect(result.user?.userId).toBe("account");
    expect(mocks.premium).toHaveBeenCalledWith("account");
    expect(mocks.db).toHaveBeenCalledWith("account");
  });
});
