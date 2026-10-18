import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  activeAccess,
  entitlementFromSources,
  grantStatus,
  normalizeGrantEmail,
  type AccessSource,
} from "@/lib/entitlement-policy";
import { mapRevenueCatSubscriber, validRevenueCatSignature } from "@/lib/revenuecat.server";
import { normalizePreferences, personalize } from "@/lib/preferences";
import { recipeMatchesDiet } from "@/lib/recipe-safety";
const now = Date.parse("2026-10-18T12:00:00Z");
const future = "2026-11-18T12:00:00Z";
function source(patch: Partial<AccessSource> = {}): AccessSource {
  return { source: "paid", tier: "premium", expiresAt: future, ...patch };
}
function subscriber(patch: Record<string, unknown> = {}) {
  return {
    subscriber: {
      entitlements: { premium: { product_identifier: "family_monthly", expires_date: future } },
      subscriptions: {
        family_monthly: {
          expires_date: future,
          period_type: "normal",
          is_sandbox: false,
          ...patch,
        },
      },
      management_url: "https://billing.example.test/manage",
    },
  };
}
afterEach(() => vi.unstubAllEnvs());
describe("central entitlement policy", () => {
  it.each(["paid", "trial", "complimentary", "family"] as const)(
    "accepts a valid %s source",
    (kind) => expect(entitlementFromSources([source({ source: kind })], now).isPremium).toBe(true),
  );
  it("expires at the precise boundary and fails closed on missing or invalid expiry", () => {
    for (const expiry of [null, "invalid", new Date(now).toISOString()])
      expect(activeAccess(source({ expiresAt: expiry }), now)).toBe(false);
  });
  it("never treats future or revoked access as active", () => {
    expect(activeAccess(source({ startsAt: future }), now)).toBe(false);
    expect(activeAccess(source({ revoked: true }), now)).toBe(false);
  });
  it("revoking complimentary access preserves paid access", () =>
    expect(
      entitlementFromSources([source({ source: "complimentary", revoked: true }), source()], now),
    ).toMatchObject({ isPremium: true, tier: "premium", store: "paid" }));
  it("keeps independent trial and family access when a grant expires", () =>
    expect(
      entitlementFromSources(
        [
          source({ source: "complimentary", expiresAt: new Date(now - 1).toISOString() }),
          source({ source: "trial" }),
          source({ source: "family", tier: "family" }),
        ],
        now,
      ).sources,
    ).toHaveLength(2));
  it("normalizes exact email addresses without removing dots or plus tags", () => {
    expect(normalizeGrantEmail(" A.B+food@Example.COM ")).toBe("a.b+food@example.com");
    expect(grantStatus({ user_id: null })).toBe("pending");
    expect(grantStatus({ user_id: "uid", expires_at: new Date(now - 1).toISOString() }, now)).toBe(
      "expired",
    );
  });
});
describe("verified RevenueCat state", () => {
  it("uses exact configured family products", () => {
    vi.stubEnv("REVENUECAT_FAMILY_PRODUCT_IDS", "family_monthly");
    expect(mapRevenueCatSubscriber(subscriber(), "uid", now)).toMatchObject({
      is_active: true,
      is_family: true,
      is_trial: false,
    });
    vi.stubEnv("REVENUECAT_FAMILY_PRODUCT_IDS", "other");
    expect(mapRevenueCatSubscriber(subscriber(), "uid", now).is_family).toBe(false);
  });
  it("keeps cancellation access until paid expiry", () =>
    expect(
      mapRevenueCatSubscriber(
        subscriber({ unsubscribe_detected_at: new Date(now).toISOString() }),
        "uid",
        now,
      ),
    ).toMatchObject({ is_active: true, auto_renew: false }));
  it("recognizes trials, expiry, sandbox and provider-confirmed grace", () => {
    expect(mapRevenueCatSubscriber(subscriber({ period_type: "trial" }), "uid", now).is_trial).toBe(
      true,
    );
    expect(mapRevenueCatSubscriber(subscriber(), "uid", Date.parse(future)).is_active).toBe(false);
    expect(mapRevenueCatSubscriber(subscriber({ is_sandbox: true }), "uid", now).is_active).toBe(
      false,
    );
    expect(
      mapRevenueCatSubscriber(
        subscriber({
          billing_issues_detected_at: new Date(now).toISOString(),
          grace_period_expires_date: "2026-11-20T00:00:00Z",
        }),
        "uid",
        now,
      ).status,
    ).toBe("in_grace");
  });
  it("does not shorten paid access to an older grace date", () =>
    expect(
      mapRevenueCatSubscriber(
        subscriber({ grace_period_expires_date: new Date(now).toISOString() }),
        "uid",
        now,
      ).expires_at,
    ).toBe(future));
  it("requires raw body signature, bearer authorization and a recent timestamp", () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "synthetic-bearer");
    vi.stubEnv("REVENUECAT_WEBHOOK_SIGNING_SECRET", "synthetic-signing");
    const raw = '{"event":{"id":"fixture"}}';
    const t = Math.floor(now / 1000);
    const sig = `t=${t},v1=${createHmac("sha256", "synthetic-signing").update(`${t}.${raw}`).digest("hex")}`;
    expect(validRevenueCatSignature(raw, "Bearer synthetic-bearer", sig, now)).toBe(true);
    expect(validRevenueCatSignature(raw + " ", "Bearer synthetic-bearer", sig, now)).toBe(false);
    expect(validRevenueCatSignature(raw, "wrong", sig, now)).toBe(false);
    expect(validRevenueCatSignature(raw, "synthetic-bearer", sig, now + 301000)).toBe(false);
  });
});
describe("personalized food safety", () => {
  it.each([
    ["allergies", "peanuts", "groundnuts"],
    ["allergies", "milk", "parmesan"],
    ["allergies", "tree nuts", "almonds"],
    ["diets", "Vegan", "butter"],
    ["diets", "Vegetarian", "salmon"],
    ["diets", "Pescatarian", "beef"],
    ["dietary_restrictions", "Gluten-free", "couscous"],
    ["disliked_foods", "mushrooms", "mushroom"],
  ])("excludes %s %s from ingredient lists", (key, value, ingredient) => {
    const p = normalizePreferences({ [key]: [value] });
    expect(recipeMatchesDiet(p, { name: "A bowl", ingredients: [{ name: ingredient }] })).toBe(
      false,
    );
  });
  it("does not confuse ham with unrelated words and rejects unknown ingredient lists", () => {
    const p = normalizePreferences({ disliked_foods: ["ham"] });
    expect(recipeMatchesDiet(p, { name: "Chamangos", ingredients: [{ name: "mango" }] })).toBe(
      true,
    );
    expect(recipeMatchesDiet(p, { name: "Mystery bowl" })).toBe(false);
  });
  it("filters conflicts instead of pushing them below safe results", () => {
    const p = normalizePreferences({ allergies: ["peanut"] });
    expect(personalize(p, ["peanut curry", "tomato rice"], (name) => [name])).toEqual([
      "tomato rice",
    ]);
  });
  it("preserves existing preferences field by field and never forces a weight goal", () => {
    const p = normalizePreferences({
      goal: "Save time",
      allergies: ["sesame"],
      cooking_level: "Experienced",
      household_size: 100,
    });
    expect(p).toMatchObject({
      goals: ["Save time"],
      allergies: ["sesame"],
      cooking_level: "Experienced",
      household_size: 1,
      budget_amount: null,
    });
  });
});
