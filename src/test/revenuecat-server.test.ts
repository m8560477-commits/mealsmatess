import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => {
  type Row = Record<string, any>;
  const tables = new Map<string, Map<string, Row>>();
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };
  const collection = (name: string, filters: [string, unknown][] = []) => ({
    doc(id: string): any {
      return { name, id, get: async () => snapshot(name, id) };
    },
    where: (field: string, _op: string, value: unknown) =>
      collection(name, [...filters, [field, value]]),
    limit: () => collection(name, filters),
    get: async () => ({
      docs: [...table(name).keys()]
        .filter((id) => filters.every(([field, value]) => table(name).get(id)?.[field] === value))
        .map((id) => snapshot(name, id)),
    }),
  });
  const snapshot = (name: string, id: string): any => {
    const data = table(name).get(id);
    const copy = data ? structuredClone(data) : undefined;
    return { id, exists: !!copy, data: () => copy, ref: collection(name).doc(id) };
  };
  let tail: Promise<unknown> = Promise.resolve();
  const db = {
    collection,
    runTransaction: async (fn: any) => {
      const work = tail.then(async () => {
        const pending: (() => void)[] = [];
        const result = await fn({
          get: (ref: any) => ref.get(),
          set: (ref: any, value: Row) =>
            pending.push(() => table(ref.name).set(ref.id, structuredClone(value))),
          update: (ref: any, value: Row) =>
            pending.push(() =>
              table(ref.name).set(ref.id, { ...table(ref.name).get(ref.id), ...value }),
            ),
        });
        pending.forEach((write) => write());
        return result;
      });
      tail = work.catch(() => undefined);
      return work;
    },
  };
  return { table, tables, db, exists: vi.fn(), fetch: vi.fn() };
});
vi.mock("@/server/firebase-admin", () => ({
  getFirebaseAdminFirestore: () => f.db,
  firebaseAuthUserExists: f.exists,
  firebaseAdmin: { rpc: async () => ({ data: true, error: null }) },
}));
import {
  refreshRevenueCat,
  preflightPurchase,
  revenueCatConfig,
} from "@/lib/billing/revenuecat.server";
import { Route } from "@/routes/api/public/webhooks.revenuecat";
const post = (
  Route.options.server as { handlers: { POST: (arg: { request: Request }) => Promise<Response> } }
).handlers.POST;
function body(expires = "2099-01-01T00:00:00Z") {
  return {
    subscriber: {
      original_app_user_id: "alice",
      entitlements: {
        "MealMate Pro": {
          product_identifier: "premium:monthly",
          expires_date: expires,
          purchase_date: "2026-10-01T00:00:00Z",
        },
      },
      subscriptions: {
        "premium:monthly": {
          expires_date: expires,
          purchase_date: "2026-10-01T00:00:00Z",
          is_sandbox: false,
          store: "play_store",
        },
      },
    },
  };
}
function request(patch = {}, auth = "Bearer synthetic-webhook") {
  return {
    request: new Request("https://example.test/api/public/webhooks/revenuecat", {
      method: "POST",
      headers: { authorization: auth },
      body: JSON.stringify({
        event: {
          id: "event-1",
          type: "INITIAL_PURCHASE",
          app_user_id: "alice",
          product_id: "premium:monthly",
          environment: "PRODUCTION",
          store: "PLAY_STORE",
          price_in_purchased_currency: 10,
          currency: "USD",
          ...patch,
        },
      }),
    }),
  };
}
beforeEach(async () => {
  await import("@/server/firebase-admin");
  await import("@/lib/billing/revenuecat.server");
  vi.restoreAllMocks();
  vi.clearAllMocks();
  f.tables.clear();
  for (const [key, value] of Object.entries({
    REVENUECAT_CONSUMER_ENTITLEMENT_ID: "MealMate Pro",
    REVENUECAT_CONSUMER_OFFERING_ID: "default",
    REVENUECAT_CONSUMER_PRODUCT_IDS: "premium:monthly",
    REVENUECAT_ENVIRONMENT: "PRODUCTION",
    REVENUECAT_SECRET_API_KEY: "sk_synthetic",
    REVENUECAT_ANDROID_PUBLIC_KEY: "goog_synthetic",
    REVENUECAT_WEBHOOK_SECRET: "synthetic-webhook",
  }))
    vi.stubEnv(key, value);
  vi.stubGlobal("fetch", f.fetch);
  f.fetch.mockImplementation(async () => new Response(JSON.stringify(body())));
  f.exists.mockResolvedValue(true);
});
describe("verified persistence and preflight", () => {
  it("preserves independent grants and retires legacy RC rows", async () => {
    f.table("subscriptions").set("manual", {
      user_id: "alice",
      status: "active",
      tier: "lifetime",
      store: "promo",
      is_manual: true,
    });
    f.table("subscriptions").set("legacy", {
      user_id: "alice",
      status: "active",
      rc_app_user_id: "alice",
      store: "play_store",
      is_manual: false,
    });
    f.table("subscriptions").set("other", {
      user_id: "bob",
      status: "active",
      rc_app_user_id: "bob",
      store: "play_store",
    });
    await refreshRevenueCat("alice");
    expect(f.table("subscriptions").get("manual")?.status).toBe("active");
    expect(f.table("subscriptions").get("legacy")?.status).toBe("expired");
    expect(f.table("subscriptions").get("other")?.status).toBe("active");
    await expect(preflightPurchase("alice", "premium:monthly")).rejects.toThrow(
      "already have Premium",
    );
  });
  it("preserves a manual grant that existing admin/promo code placed on the RC row", async () => {
    await refreshRevenueCat("alice");
    const [id, row] = [...f.table("subscriptions")][0];
    f.table("subscriptions").set(id, {
      ...row,
      is_manual: true,
      store: "promo",
      status: "active",
      tier: "lifetime",
      period_end: null,
      rc_verified_at_ms: 0,
    });
    f.fetch.mockImplementation(
      async () => new Response(JSON.stringify(body("2026-01-01T00:00:00Z"))),
    );
    await refreshRevenueCat("alice");
    expect(f.table("subscriptions").get(id)?.status).toBe("expired");
    expect(
      [...f.table("subscriptions").values()].some(
        (r) => r.is_manual && r.tier === "lifetime" && r.status === "active",
      ),
    ).toBe(true);
  });
  it("sandbox refresh cannot replace or retire production access", async () => {
    await refreshRevenueCat("alice");
    const [id, production] = [...f.table("subscriptions")][0];
    vi.stubEnv("REVENUECAT_ENVIRONMENT", "SANDBOX");
    const sandbox = body();
    sandbox.subscriber.subscriptions["premium:monthly"].is_sandbox = true;
    f.fetch.mockImplementation(async () => new Response(JSON.stringify(sandbox)));
    expect(await refreshRevenueCat("alice")).toEqual({ active: false, sandbox: true });
    expect(f.table("subscriptions").get(id)).toEqual(production);
    expect(f.table("subscriptions").size).toBe(2);
  });
  it("does not erase access on provider failure", async () => {
    await refreshRevenueCat("alice");
    const before = structuredClone([...f.table("subscriptions")]);
    f.fetch.mockResolvedValue(new Response("Unavailable", { status: 503 }));
    await expect(refreshRevenueCat("alice")).rejects.toThrow("temporarily unavailable");
    expect([...f.table("subscriptions")]).toEqual(before);
  });
  it("permits a new subscriber only after authoritative absence and no independent grant", async () => {
    f.fetch.mockResolvedValue(new Response("Not found", { status: 404 }));
    await expect(preflightPurchase("alice", "premium:monthly")).resolves.toEqual({ ok: true });
    f.table("subscriptions").set("promo", {
      user_id: "alice",
      tier: "lifetime",
      status: "active",
      is_manual: true,
    });
    await expect(preflightPurchase("alice", "premium:monthly")).rejects.toThrow(
      "already have Premium",
    );
  });
  it("a slower old refresh cannot undo a newer expiry", async () => {
    let resolveOld!: (r: Response) => void;
    let clock = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => ++clock);
    f.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveOld = resolve;
        }),
    );
    const old = refreshRevenueCat("alice");
    await vi.waitFor(() => expect(resolveOld).toBeTypeOf("function"));
    f.fetch.mockResolvedValue(new Response(JSON.stringify(body("1970-01-01T00:00:01Z"))));
    expect((await refreshRevenueCat("alice")).active).toBe(false);
    resolveOld(new Response(JSON.stringify(body())));
    expect((await old).active).toBe(false);
  });
  it("supports legacy Vercel key names but rejects wrong key types", () => {
    vi.stubEnv("REVENUECAT_SECRET_API_KEY", "");
    vi.stubEnv("REVENUECAT_ANDROID_PUBLIC_KEY", "");
    vi.stubEnv("REVENUECAT_API_KEY", "sk_legacy");
    vi.stubEnv("REVENUECAT_SDK_KEY", "goog_legacy");
    expect(revenueCatConfig().androidKey).toBe("goog_legacy");
    vi.stubEnv("REVENUECAT_SDK_KEY", "test_not_play");
    expect(() => revenueCatConfig()).toThrow("not configured");
  });
});
describe("webhook verification", () => {
  it("requires the webhook secret before provider or database work", async () => {
    expect((await post(request({}, "Bearer wrong"))).status).toBe(401);
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("ignores sandbox and Test Store events", async () => {
    expect((await post(request({ environment: "SANDBOX" }))).status).toBe(200);
    expect((await post(request({ store: "TEST_STORE" }))).status).toBe(200);
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.tables.size).toBe(0);
  });
  it("records payments/referrals once even when refresh already activated access", async () => {
    await refreshRevenueCat("alice");
    f.table("referrals").set("referral-1", {
      referrer_id: "bob",
      referred_id: "alice",
      reward_days: 14,
      status: "pending",
    });
    const results = await Promise.all([post(request()), post(request())]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(f.table("payments").size).toBe(1);
    expect(f.table("referrals").get("referral-1")?.status).toBe("rewarded");
    expect(
      [...f.table("subscriptions").values()].filter((r) => r.source === "referral"),
    ).toHaveLength(2);
    expect((await post(request())).status).toBe(200);
    expect(f.table("payments").size).toBe(1);
  });
  it("does not activate from a delayed INITIAL_PURCHASE when REST says expired", async () => {
    f.fetch.mockImplementation(
      async () => new Response(JSON.stringify(body("2026-01-01T00:00:00Z"))),
    );
    expect((await post(request())).status).toBe(200);
    expect([...f.table("subscriptions").values()].every((r) => r.status === "expired")).toBe(true);
  });
});
