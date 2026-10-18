import { describe, expect, it } from "vitest";
import { aiProfile } from "@/lib/ai-profile";
import { preferenceSummary } from "@/lib/preferences";

describe("saved AI food preferences", () => {
  it("uses onboarding answers in place of stale legacy profile fields", () => {
    const profile = aiProfile({
      goal: "Old goal",
      allergies: ["milk"],
      dietary_preferences: ["Vegetarian"],
      weight_kg: 70,
      preferences: {
        goal: "Build muscle",
        allergies: ["peanuts"],
        dietary_restrictions: ["Vegan"],
        food_budget: "Budget friendly",
        cooking_time: "Under 20 minutes",
        disliked_foods: ["olives"],
      },
    });
    expect(profile).toMatchObject({
      goal: "Build muscle",
      allergies: ["peanuts"],
      dietary_preferences: ["Vegan"],
      weight_kg: 70,
    });
    const summary = preferenceSummary(profile!.preferences);
    for (const value of [
      "Build muscle",
      "peanuts",
      "Vegan",
      "Budget friendly",
      "Under 20 minutes",
      "olives",
    ])
      expect(summary).toContain(value);
  });

  it("keeps legacy settings when no onboarding answer has been saved for that field", () => {
    expect(
      aiProfile({
        goal: "Eat healthier",
        allergies: ["milk"],
        dietary_preferences: ["Vegetarian"],
        preferences: { cooking_level: "Beginner" },
      }),
    ).toMatchObject({
      goal: "Eat healthier",
      allergies: ["milk"],
      dietary_preferences: ["Vegetarian"],
      preferences: { cooking_level: "Beginner" },
    });
  });

  it("honors clearing a preference without restoring stale answers", () => {
    expect(
      aiProfile({
        goal: "Old goal",
        allergies: ["milk"],
        dietary_preferences: ["Vegan"],
        preferences: { goal: null, allergies: [], dietary_restrictions: [] },
      }),
    ).toMatchObject({ goal: null, allergies: [], dietary_preferences: [] });
  });

  it("handles absent or malformed stored values", () => {
    expect(aiProfile(null)).toBeNull();
    expect(
      aiProfile({ allergies: 12, dietary_preferences: "Vegan", preferences: [] }),
    ).toMatchObject({ allergies: [], dietary_preferences: [] });
  });
});
