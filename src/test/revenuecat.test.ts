import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertBillingOrigin,
  parseRevenueCatAccess,
  purchaseIdentity,
  verifyPurchaseSession,
  verifyAccountAccess,
  verifyRevenueCatCustomer,
  requireActivePremium,
} from "@/server/revenuecat";
const mock = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  const ref = (key: string) => ({
    key,
    get: async () => ({ exists: rows.has(key), data: () => rows.get(key) }),
    set: async (data: Record<string, unknown>, options?: { merge: boolean }) => {
      rows.set(key, options?.merge ? { ...rows.get(key), ...data } : data);
    },
  });
  return {
    rows,
    db: {
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
      runTransaction: async (run: (tx: unknown) => unknown) =>
        run({
          get: (r: ReturnType<typeof ref>) => r.get(),
          set: (
            r: ReturnType<typeof ref>,
            data: Record<string, unknown>,
            opts?: { merge: boolean },
          ) => r.set(data, opts),
        }),
    },
  };
});
vi.mock("@/server/firebase-admin", () => ({ getFirebaseAdminFirestore: () => mock.db }));
const now = Date.now();
const purchased = new Date(now - 86400_000).toISOString();
const future = new Date(now + 86400_000).toISOString();
function subscriber(expires: string | null = future, sandbox = false) {
  return {
    entitlements: {
      premium: { product_identifier: "monthly", purchase_date: purchased, expires_date: expires },
    },
    subscriptions: {
      monthly: {
        period_type: "normal",
        is_sandbox: sandbox,
        store: "play_store",
        unsubscribe_detected_at: null as string | null,
      },
    },
  };
}
beforeEach(() => {
  mock.rows.clear();
  vi.stubEnv("REVENUECAT_SECRET_API_KEY", "synthetic-server-key");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL_ENV", "preview");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("RevenueCat authority", () => {
  it("requires the exact entitlement, valid purchase date and unexpired access", () => {
    expect(parseRevenueCatAccess({}, now).isPremium).toBe(false);
    expect(
      parseRevenueCatAccess({ entitlements: { pro: subscriber().entitlements.premium } }, now)
        .isPremium,
    ).toBe(false);
    expect(parseRevenueCatAccess(subscriber(purchased), now).isPremium).toBe(false);
    expect(parseRevenueCatAccess(subscriber("invalid"), now).isPremium).toBe(false);
    const invalid = subscriber();
    invalid.entitlements.premium.purchase_date = future;
    expect(parseRevenueCatAccess(invalid, now).isPremium).toBe(false);
    expect(parseRevenueCatAccess(subscriber(), now)).toMatchObject({
      isPremium: true,
      isManual: false,
      verifiedUntil: now + 300_000,
    });
  });
  it("distinguishes trials, cancellation before expiry, lifetime and sandbox", () => {
    const trial = subscriber();
    trial.subscriptions.monthly.period_type = "trial";
    expect(parseRevenueCatAccess(trial, now)).toMatchObject({ isPremium: true, trialActive: true });
    trial.subscriptions.monthly.unsubscribe_detected_at = purchased;
    expect(parseRevenueCatAccess(trial, now)).toMatchObject({ isPremium: true, autoRenew: false });
    expect(parseRevenueCatAccess(subscriber(null), now).isPremium).toBe(true);
    expect(parseRevenueCatAccess(subscriber(future, true), now).isPremium).toBe(false);
    expect(parseRevenueCatAccess(subscriber(future, true), now, true).isPremium).toBe(true);
    expect(
      parseRevenueCatAccess(subscriber(new Date(now + 1000).toISOString()), now).verifiedUntil,
    ).toBe(now + 1000);
  });
  it("fails closed on unavailable, malformed or missing server configuration", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    await expect(verifyRevenueCatCustomer("account")).rejects.toThrow("temporarily unavailable");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
    await expect(verifyRevenueCatCustomer("account")).rejects.toThrow("invalid response");
    vi.stubEnv("REVENUECAT_SECRET_API_KEY", "");
    await expect(requireActivePremium("account")).rejects.toThrow("temporarily unavailable");
  });
  it("permits explicit sandbox verification on Vercel preview only", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("REVENUECAT_ALLOW_SANDBOX", "true");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(Response.json({ subscriber: subscriber(future, true) })),
        ),
    );
    expect((await verifyRevenueCatCustomer("tester")).isPremium).toBe(true);
    vi.stubEnv("VERCEL_ENV", "");
    expect((await verifyRevenueCatCustomer("tester")).isPremium).toBe(false);
  });
  it("ignores sandbox and endpoint overrides in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("REVENUECAT_ALLOW_SANDBOX", "true");
    vi.stubEnv("REVENUECAT_API_BASE_URL", "https://invalid.test");
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ subscriber: subscriber(future, true) }));
    vi.stubGlobal("fetch", fetch);
    expect((await verifyRevenueCatCustomer("a/b")).isPremium).toBe(false);
    expect(fetch.mock.calls[0][0]).toBe("https://api.revenuecat.com/v1/subscribers/a%2Fb");
  });
});
describe("purchase claim request origin", () => {
  it("accepts same-origin browser requests and rejects cross-site, sibling-site and absent origins", () => {
    const request = (headers: Record<string, string>) =>
      new Request("https://mealsmates.site/_serverFn/test", { headers });
    expect(() => assertBillingOrigin(request({ "sec-fetch-site": "same-origin" }))).not.toThrow();
    expect(() => assertBillingOrigin(request({ origin: "https://mealsmates.site" }))).not.toThrow();
    const rejectedOrigins: Record<string, string>[] = [
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site", origin: "https://hub.mealsmates.site" },
      { origin: "https://attacker.test" },
      {},
    ];
    for (const headers of rejectedOrigins) {
      try {
        assertBillingOrigin(request(headers));
        throw new Error("Request unexpectedly accepted");
      } catch (error) {
        expect(error).toMatchObject({ status: 403 });
      }
    }
  });
});
describe("checkout to Firebase account binding", () => {
  it("keeps the purchase claim separate from the public SDK identity", async () => {
    const identity = await purchaseIdentity();
    expect(identity.customerId).toMatch(/^mm_[a-f0-9]{48}$/);
    expect(identity.token).toMatch(/^[a-f0-9]{64}$/);
    expect((await purchaseIdentity(identity.token!)).customerId).toBe(identity.customerId);
    expect((await verifyPurchaseSession(identity.customerId)).isPremium).toBe(false);
    expect((await verifyPurchaseSession("guessed")).isPremium).toBe(false);
  });
  it("binds a verified pre-sign-in purchase to one account and permits repeat checks", async () => {
    const identity = await purchaseIdentity();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        Response.json({ subscriber: url.endsWith(identity.customerId) ? subscriber() : {} }),
      ),
    );
    expect((await verifyPurchaseSession(identity.token!)).isPremium).toBe(true);
    expect((await verifyAccountAccess("account-a", identity.token!)).isPremium).toBe(true);
    expect((await verifyAccountAccess("account-a", identity.token!)).isPremium).toBe(true);
    expect((await verifyAccountAccess("account-b", identity.token!)).isPremium).toBe(false);
    expect((await verifyPurchaseSession(identity.token!)).isPremium).toBe(false);
    expect(mock.rows.get("billing_links/account-a")).toEqual({ customerId: identity.customerId });
    expect(mock.rows.get("premium_access/account-a")?.source).toBe("revenuecat");
    expect(mock.rows.has("billing_links/account-b")).toBe(false);
  });
  it("never accepts local/manual grants as entitlement proof and blocks protected work", async () => {
    mock.rows.set("subscriptions/account", { is_manual: true, status: "active" });
    mock.rows.set("premium_access/account", { valid_until: future });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ subscriber: {} })));
    await expect(requireActivePremium("account")).rejects.toMatchObject({ status: 402 });
    expect(mock.rows.get("premium_access/account")?.valid_until).toMatchObject({ seconds: 0 });
  });
});
