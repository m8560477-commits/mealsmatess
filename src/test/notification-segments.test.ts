import { describe, expect, it } from "vitest";
import { isHealthyInterest } from "@/lib/notification-segments";

describe("healthy-interest announcement audience", () => {
  it("matches a stored healthy-eating goal", () => {
    expect(isHealthyInterest({ preferences: { goal: "Eat healthier" } })).toBe(true);
  });

  it("matches stored weight-loss and nutrition preferences", () => {
    expect(
      isHealthyInterest({
        preferences: { goal: "Lose weight", preferred_features: ["nutrition coaching"] },
      }),
    ).toBe(true);
  });

  it("does not infer health interest from unrelated preferences", () => {
    expect(
      isHealthyInterest({
        preferences: { goal: "Save money", dietary_restrictions: ["vegetarian"] },
      }),
    ).toBe(false);
  });

  it("handles absent or malformed profile preferences safely", () => {
    expect(isHealthyInterest({ preferences: null })).toBe(false);
    expect(isHealthyInterest({ preferences: "not-an-object" })).toBe(false);
  });
});
