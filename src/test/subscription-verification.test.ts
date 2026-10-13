import { afterEach, describe, expect, it, vi } from "vitest";
import { interpretEntitlement, revenueCatConfiguration, handleRevenueCatWebhook } from "@/lib/revenuecat.server";

afterEach(() => vi.unstubAllEnvs());

describe("RevenueCat entitlement verification", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  function subscriber(expiresDate: string | null, changes = {}) {
    return { entitlements: { configured_entitlement: { product_identifier: "configured-product", expires_date: expiresDate } }, subscriptions: { "configured-product": { is_sandbox: false, store: "play_store", period_type: "NORMAL", ...changes } } };
  }
  it("grants only the configured, active, production entitlement", () => {
    expect(interpretEntitlement(subscriber("2026-11-01T00:00:00Z"), "configured_entitlement", now).isPremium).toBe(true);
    expect(interpretEntitlement(subscriber("2026-11-01T00:00:00Z"), "missing_entitlement", now).isPremium).toBe(false);
  });
  it("keeps cancelled subscriptions active until their actual expiry", () => {
    const result = interpretEntitlement(subscriber("2026-11-01T00:00:00Z", { unsubscribe_detected_at: "2026-10-12T00:00:00Z" }), "configured_entitlement", now);
    expect(result.isPremium).toBe(true);
    expect(result.autoRenew).toBe(false);
  });
  it("rejects expired, sandbox and malformed entitlement data", () => {
    expect(interpretEntitlement(subscriber("2026-10-01T00:00:00Z"), "configured_entitlement", now).isPremium).toBe(false);
    expect(interpretEntitlement(subscriber("2026-11-01T00:00:00Z", { is_sandbox: true }), "configured_entitlement", now).isPremium).toBe(false);
    expect(interpretEntitlement(subscriber("not-a-date"), "configured_entitlement", now).isPremium).toBe(false);
    expect(interpretEntitlement({ entitlements: { configured_entitlement: {} } }, "configured_entitlement", now).isPremium).toBe(false);
  });
  it("honors verified grace periods and actual trial status", () => {
    const result = interpretEntitlement(subscriber("2026-10-12T00:00:00Z", { grace_period_expires_date: "2026-10-15T00:00:00Z", period_type: "TRIAL" }), "configured_entitlement", now);
    expect(result.isPremium).toBe(true);
    expect(result.trialActive).toBe(true);
  });
  it("supports verified lifetime non-subscription purchases", () => {
    const result = interpretEntitlement({ entitlements: { configured_entitlement: { product_identifier: "configured-lifetime", expires_date: null } }, non_subscriptions: { "configured-lifetime": [{ is_sandbox: false, store: "app_store" }] } }, "configured_entitlement", now);
    expect(result.isPremium).toBe(true);
    expect(result.store).toBe("app_store");
  });
  it("never exposes the secret API key as a public SDK key", () => {
    vi.stubEnv("REVENUECAT_WEB_PUBLIC_API_KEY", "sk_test_only_not_a_real_key");
    vi.stubEnv("REVENUECAT_ENTITLEMENT_ID", "configured_entitlement");
    expect(() => revenueCatConfiguration("web")).toThrow("public SDK key");
    expect(() => revenueCatConfiguration("unsupported")).toThrow();
  });
  it("rejects unauthenticated webhooks before accessing data", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "test-only-webhook-value");
    const result = await handleRevenueCatWebhook(new Request("https://example.test/api/public/webhooks/revenuecat", { method: "POST", headers: { authorization: "Bearer wrong-value" } }));
    expect(result.status).toBe(401);
  });
  it("disables the webhook if no authorization secret is configured", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "");
    expect((await handleRevenueCatWebhook(new Request("https://example.test/api/public/webhooks/revenuecat", { method: "POST" }))).status).toBe(503);
  });
});
