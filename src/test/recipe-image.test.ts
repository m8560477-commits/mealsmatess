import { describe, expect, it } from "vitest";
import {
  recipeImageUrl,
  categoryFallbackUrl,
  NEUTRAL_RECIPE_PLACEHOLDER,
} from "@/lib/recipe-image";

describe("Recipe image safety", () => {
  it("uses the persisted verified image", () => {
    expect(
      recipeImageUrl({
        name: "Spicy chicken ramen",
        image_source: "Pexels",
        image_url: "https://example.com/ramen.jpg",
      }),
    ).toBe("https://example.com/ramen.jpg");
  });
  it("does not replace an unknown dish with random food", () => {
    expect(categoryFallbackUrl({ name: "Spicy chicken ramen" })).toBe(NEUTRAL_RECIPE_PLACEHOLDER);
  });
  it("does not trust an unverified arbitrary stored photo", () => {
    expect(
      recipeImageUrl({ name: "Spicy chicken ramen", image_url: "https://example.com/pizza.jpg" }),
    ).toBe(NEUTRAL_RECIPE_PLACEHOLDER);
  });
});
