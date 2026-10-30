import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/api/public/webhooks.revenuecat";
const mocks = vi.hoisted(() => ({
  links: vi.fn(),
  exists: vi.fn(),
  previous: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/server/firebase-admin", () => ({
  firebaseAuthUserExists: mocks.exists,
  getFirebaseAdminFirestore: () => ({
    collection: () => ({ where: () => ({ limit: () => ({ get: mocks.links }) }) }),
  }),
  firebaseAdmin: { from: mocks.from },
}));
type Handler = (ctx: { request: Request }) => Promise<Response>;
const post = (Route.options.server as { handlers: { POST: Handler } }).handlers.POST;
const customer = `mm_${"a".repeat(48)}`;
function request(appUserId = customer, secret = "synthetic-webhook-secret") {
  return {
    request: new Request("https://mealsmates.site/api/public/webhooks/revenuecat", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({
        event: { id: "synthetic-event", type: "INITIAL_PURCHASE", app_user_id: appUserId },
      }),
    }),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "synthetic-webhook-secret");
  mocks.links.mockResolvedValue({ empty: true, docs: [] });
  mocks.exists.mockResolvedValue(false);
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: mocks.previous }) }) });
  mocks.previous.mockResolvedValue({ data: { processed: true } });
});
afterEach(() => vi.unstubAllEnvs());
describe("pre-account RevenueCat webhook recovery", () => {
  it("requires webhook authorization before looking up ownership", async () => {
    expect((await post(request(customer, "wrong-secret"))).status).toBe(401);
    expect(mocks.links).not.toHaveBeenCalled();
  });
  it("keeps an early purchase event retryable without granting access or discarding history", async () => {
    const response = await post(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("resolves a checkout identity to its owning Firebase account", async () => {
    mocks.links.mockResolvedValue({ empty: false, docs: [{ id: "owning-account" }] });
    expect((await post(request())).status).toBe(400);
    expect(mocks.exists).toHaveBeenCalledWith("owning-account");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("retains idempotency for existing Firebase-UID customers", async () => {
    mocks.exists.mockResolvedValue(true);
    expect((await post(request("legacy-account"))).status).toBe(200);
    expect(mocks.links).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledWith("subscription_events");
  });
});
