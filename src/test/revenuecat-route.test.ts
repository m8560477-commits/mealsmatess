import { beforeEach, expect, it, vi } from "vitest";
import { Route } from "@/routes/api/public/webhooks.revenuecat";
const mocks = vi.hoisted(() => ({ process: vi.fn() }));
vi.mock("@/server/revenuecat-webhook", async (original) => ({
  ...(await original<typeof import("@/server/revenuecat-webhook")>()),
  processRevenueCatEvent: mocks.process,
}));
type Handler = (value: { request: Request }) => Promise<Response>;
const post = (Route.options.server as { handlers: { POST: Handler } }).handlers.POST;
const request = (event: unknown, token = "test-webhook-secret") =>
  post({
    request: new Request("https://example.test/api/public/webhooks/revenuecat", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event }),
    }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "test-webhook-secret");
  mocks.process.mockResolvedValue("ok");
});
it("rejects unauthorized requests before processing", async () => {
  expect((await request({ type: "RENEWAL" }, "wrong")).status).toBe(401);
  expect(mocks.process).not.toHaveBeenCalled();
});
it("acknowledges unsupported TRANSFER envelopes without app_user_id", async () => {
  expect((await request({ type: "TRANSFER", id: "synthetic-transfer" })).status).toBe(200);
  expect(mocks.process).not.toHaveBeenCalled();
});
it("accepts nullable metadata on supported events and rejects malformed events", async () => {
  expect(
    (
      await request({
        type: "RENEWAL",
        id: "synthetic-renewal",
        app_user_id: "test",
        environment: "PRODUCTION",
        currency: null,
        entitlement_ids: null,
        price_in_purchased_currency: null,
      })
    ).status,
  ).toBe(200);
  expect((await request({ type: "RENEWAL" })).status).toBe(400);
});
