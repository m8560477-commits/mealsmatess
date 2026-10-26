import { describe, expect, it } from "vitest";
import { activeGrant, verifiedSubscription } from "@/lib/billing/revenuecat-policy";
import { approvedOffer, offerPrice, hasSevenDayTrial } from "@/lib/billing/revenuecat-offers";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
const now = Date.parse("2026-10-25T12:00:00Z");
const policy = {
  entitlement: "MealMate Pro",
  productIds: ["premium:monthly"],
  environment: "PRODUCTION" as const,
};
function fixture() {
  return {
    subscriber: {
      original_app_user_id: "alice",
      entitlements: {
        "MealMate Pro": {
          product_identifier: "premium:monthly",
          expires_date: "2026-11-01T00:00:00Z",
          purchase_date: "2026-10-01T00:00:00Z",
          grace_period_expires_date: null as string | null,
        },
      },
      subscriptions: {
        "premium:monthly": {
          expires_date: "2026-11-01T00:00:00Z" as string | null,
          purchase_date: "2026-10-01T00:00:00Z",
          grace_period_expires_date: null as string | null,
          store: "play_store",
          is_sandbox: false,
          refunded_at: null as string | null,
          unsubscribe_detected_at: null as string | null,
          period_type: "normal",
        },
      },
    },
  };
}
describe("authoritative RevenueCat access", () => {
  it("grants only the approved owner and preserves the paid period after cancellation", () => {
    const body = fixture();
    body.subscriber.subscriptions["premium:monthly"].unsubscribe_detected_at =
      "2026-10-20T00:00:00Z";
    expect(verifiedSubscription(body, "alice", policy, now)).toMatchObject({
      status: "active",
      auto_renew: false,
      period_end: "2026-11-01T00:00:00.000Z",
    });
    expect(() => verifiedSubscription(body, "bob", policy, now)).toThrow("original MealMate");
  });
  it.each([
    "sandbox",
    "wrong store",
    "refund",
    "null expiry",
    "expired",
    "unapproved",
    "missing entitlement",
  ])("denies %s", (condition) => {
    const body = fixture();
    const sub = body.subscriber.subscriptions["premium:monthly"];
    if (condition === "sandbox") sub.is_sandbox = true;
    if (condition === "wrong store") sub.store = "test_store";
    if (condition === "refund") sub.refunded_at = "2026-10-20T00:00:00Z";
    if (condition === "null expiry") sub.expires_date = null;
    if (condition === "expired") sub.expires_date = "2026-10-24T00:00:00Z";
    if (condition === "unapproved")
      body.subscriber.entitlements["MealMate Pro"].product_identifier = "family";
    if (condition === "missing entitlement")
      body.subscriber.entitlements = {} as typeof body.subscriber.entitlements;
    expect(verifiedSubscription(body, "alice", policy, now).status).toBe("expired");
  });
  it("records sandbox verification without granting live access", () => {
    const body = fixture();
    body.subscriber.subscriptions["premium:monthly"].is_sandbox = true;
    expect(
      verifiedSubscription(body, "alice", { ...policy, environment: "SANDBOX" }, now),
    ).toMatchObject({ status: "expired", sandbox_verified: true });
  });
  it("uses a finite mutually confirmed grace period", () => {
    const body = fixture();
    const sub = body.subscriber.subscriptions["premium:monthly"];
    const ent = body.subscriber.entitlements["MealMate Pro"];
    sub.expires_date = ent.expires_date = "2026-10-24T00:00:00Z";
    sub.grace_period_expires_date = "2026-10-27T00:00:00Z";
    expect(verifiedSubscription(body, "alice", policy, now).status).toBe("expired");
    ent.grace_period_expires_date = "2026-10-26T00:00:00Z";
    expect(verifiedSubscription(body, "alice", policy, now)).toMatchObject({
      status: "in_grace",
      period_end: "2026-10-26T00:00:00.000Z",
    });
  });
  it("rejects malformed provider data instead of silently revoking an existing grant", () => {
    expect(() => verifiedSubscription({ subscriber: {} }, "alice", policy, now)).toThrow();
  });
  it("recognizes independent manual access but not sandbox access", () => {
    expect(activeGrant({ status: "active", tier: "lifetime", is_manual: true }, now)).toBe(true);
    expect(activeGrant({ status: "active", tier: "lifetime", environment: "SANDBOX" }, now)).toBe(
      false,
    );
  });
});
function offer() {
  return {
    identifier: "$rc_monthly",
    packageType: "MONTHLY",
    product: {
      identifier: "premium:monthly",
      defaultOption: {
        isPrepaid: false,
        installmentsInfo: null,
        pricingPhases: [
          {
            recurrenceMode: 1,
            billingCycleCount: null,
            billingPeriod: { iso8601: "P1M", unit: "MONTH", value: 1 },
            price: { formatted: "R 49,99", currencyCode: "ZAR", amountMicros: 49990000 },
          },
        ],
      },
    },
  } as unknown as PurchasesPackage;
}
describe("store offer filtering", () => {
  it("displays actual currency and duration", () => {
    expect(approvedOffer(offer(), policy.productIds)).toBe(true);
    expect(offerPrice(offer())).toContain("R 49,99 ZAR per 1 month");
  });
  it("rejects prepaid, installments, lifetime and unknown products", () => {
    const pkg = offer();
    expect(approvedOffer(pkg, [])).toBe(false);
    expect(
      approvedOffer({ ...pkg, packageType: "LIFETIME" } as PurchasesPackage, policy.productIds),
    ).toBe(false);
    for (const patch of [{ isPrepaid: true }, { installmentsInfo: {} }, { pricingPhases: [] }]) {
      const changed = {
        ...pkg,
        product: { ...pkg.product, defaultOption: { ...pkg.product.defaultOption, ...patch } },
      } as PurchasesPackage;
      expect(approvedOffer(changed, policy.productIds)).toBe(false);
    }
  });
});

describe("seven-day acquisition offer", () => {
  function trial(period = "P7D", unit = "DAY", value = 7, cycles = 1, amount = 0) {
    const pkg = offer();
    pkg.product.defaultOption!.pricingPhases.unshift({
      recurrenceMode: 2,
      billingCycleCount: cycles,
      billingPeriod: { iso8601: period, unit, value },
      price: { formatted: "R 0,00", currencyCode: "ZAR", amountMicros: amount },
    } as NonNullable<typeof pkg.product.defaultOption>["pricingPhases"][number]);
    return pkg;
  }
  it("accepts exactly seven free days followed by paid renewal", () => {
    expect(hasSevenDayTrial(trial())).toBe(true);
    expect(hasSevenDayTrial(trial("P1W", "WEEK", 1))).toBe(true);
    expect(approvedOffer(trial(), policy.productIds)).toBe(true);
  });
  it("rejects immediate billing, mismatched terms, longer or paid introductory periods", () => {
    expect(hasSevenDayTrial(offer())).toBe(false);
    expect(hasSevenDayTrial(trial("P3D", "DAY", 3))).toBe(false);
    expect(hasSevenDayTrial(trial("P7D", "DAY", 7, 2))).toBe(false);
    expect(hasSevenDayTrial(trial("P7D", "DAY", 7, 1, 100))).toBe(false);
    expect(hasSevenDayTrial(trial("P7D", "WEEK", 1))).toBe(false);
    const freeForever = trial();
    const option = freeForever.product.defaultOption!;
    const paid = option.pricingPhases[1]!;
    expect(
      hasSevenDayTrial({
        ...freeForever,
        product: {
          ...freeForever.product,
          defaultOption: {
            ...option,
            pricingPhases: [
              option.pricingPhases[0]!,
              { ...paid, price: { ...paid.price, amountMicros: 0 } },
            ],
          },
        },
      }),
    ).toBe(false);
  });
});
