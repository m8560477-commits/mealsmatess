import { describe, expect, it } from "vitest";
import {
  preferencesFrom,
  inQuietHours,
  localClock,
  categoryEnabled,
  notificationNavigation,
  safeNotificationDestination,
} from "@/lib/notification-policy";
import { revenueCatAccess, manualGrantActive } from "@/lib/entitlement-policy";

describe("notification permission policy", () => {
  it("requires explicit health and promotional consent", () => {
    const p = preferencesFrom();
    expect(p.pushEnabled).toBe(false);
    expect(categoryEnabled("healthy_eating", p)).toBe(false);
    expect(categoryEnabled("promotions", p)).toBe(false);
    expect(categoryEnabled("account", p)).toBe(true);
  });
  it("handles midnight and daylight-saving changes in local quiet hours", () => {
    const p = preferencesFrom({ timeZone: "America/New_York" });
    expect(inQuietHours(p, new Date("2026-03-08T06:30:00Z"))).toBe(true);
    expect(inQuietHours(p, new Date("2026-03-08T07:30:00Z"))).toBe(true);
    expect(inQuietHours(p, new Date("2026-03-08T12:00:00Z"))).toBe(false);
    expect(localClock(new Date("2026-10-22T23:30:00Z"), "Africa/Johannesburg").date).toBe(
      "2026-10-23",
    );
  });
  it("rejects invalid zones and time strings", () => {
    expect(() => preferencesFrom({ timeZone: "invalid" })).toThrow();
    expect(() => preferencesFrom({ quietStart: "25:30" })).toThrow();
  });
  it.each([
    "https://evil.test",
    "//evil.test",
    "/recipe/../admin",
    "/recipe/test?next=evil",
    "javascript:alert(1)",
  ])("blocks unsafe destination %s", (value) =>
    expect(safeNotificationDestination(value)).toBe("/notifications"),
  );
  it("routes supported recipes internally", () =>
    expect(notificationNavigation("/recipe/vegetable-soup")).toEqual({
      to: "/recipe/$slug",
      params: { slug: "vegetable-soup" },
    }));
});
describe("RevenueCat entitlement policy", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const payload = (expires: string | null, grace?: string) => ({
    subscriber: {
      entitlements: { premium: { product_identifier: "test-product", expires_date: expires } },
      subscriptions: {
        "test-product": { period_type: "normal", grace_period_expires_date: grace },
      },
    },
  });
  it("requires the exact expected entitlement", () =>
    expect(revenueCatAccess(payload(null), "wrong", now).isPremium).toBe(false));
  it("expires paid access and keeps verified grace periods", () => {
    expect(revenueCatAccess(payload("2026-10-21"), "premium", now).isPremium).toBe(false);
    expect(revenueCatAccess(payload("2026-10-21", "2026-10-23"), "premium", now)).toMatchObject({
      isPremium: true,
      status: "in_grace",
    });
  });
  it("rejects malformed responses and invalid expiry", () => {
    expect(() => revenueCatAccess({ subscriber: {} }, "premium", now)).toThrow();
    expect(revenueCatAccess(payload("invalid"), "premium", now).isPremium).toBe(false);
  });
  it("supports verified non-expiring entitlements without accepting absent entitlement fields", () => {
    expect(revenueCatAccess(payload(null), "premium", now).isPremium).toBe(true);
    expect(() =>
      revenueCatAccess(
        {
          subscriber: {
            entitlements: { premium: { product_identifier: "test" } },
            subscriptions: {},
          },
        },
        "premium",
        now,
      ),
    ).toThrow();
  });
  it("stops expired and revoked admin grants", () => {
    expect(manualGrantActive({ expiresAt: "2026-10-23" }, now)).toBe(true);
    expect(manualGrantActive({ expiresAt: "2026-10-21" }, now)).toBe(false);
    expect(manualGrantActive({ expiresAt: "2026-10-23", revoked: true }, now)).toBe(false);
    expect(manualGrantActive({}, now)).toBe(false);
  });
});
