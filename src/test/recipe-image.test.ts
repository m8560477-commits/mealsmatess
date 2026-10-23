import { describe, expect, it } from "vitest";
import { RECIPE_PHOTOS } from "@/assets/recipes/manifest";
import {
  recipeImageUrl,
  photoRendition,
  recipePhotoSources,
  categoryFallbackUrl,
  NEUTRAL_RECIPE_PLACEHOLDER,
} from "@/lib/recipe-image";

describe("Recipe image safety", () => {
  it("serves every curated rendition from bundled local assets", () => {
    const urls = Object.values(RECIPE_PHOTOS).flatMap((photo) => [
      photo.thumb,
      photo.card,
      photo.hero,
    ]);

    expect(urls).toHaveLength(45);
    expect(urls.every((url) => typeof url === "string" && !url.includes("/__l5e/"))).toBe(true);
  });

  it("matches the audited Neapolitan margherita photo across generated slug suffixes", () => {
    const photo = recipeImageUrl({ name: "Pizza Napoletana", slug: "pizza-napoletana-4sjpv" });
    expect(photo).toContain("pizza-margherita");
    expect(photo).not.toBe(NEUTRAL_RECIPE_PLACEHOLDER);
    expect(recipeImageUrl({ name: "Pepperoni Pizza", slug: "pepperoni-pizza-abc12" })).toBe(
      NEUTRAL_RECIPE_PLACEHOLDER,
    );
  });

  it("does not mistake a meaningful dietary suffix for a generated ID", () => {
    expect(
      recipeImageUrl({ name: "Classic banana bread vegan", slug: "classic-banana-bread-vegan" }),
    ).toBe(NEUTRAL_RECIPE_PLACEHOLDER);
  });

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

describe("responsive recipe delivery", () => {
  it("uses genuinely distinct local files for each size", () => {
    for (const photo of Object.values(RECIPE_PHOTOS)) {
      expect(new Set(Object.values(photo)).size).toBe(3);
    }
  });
  it("resizes supported providers while preserving attribution parameters", () => {
    const url = new URL(
      photoRendition("https://images.unsplash.com/photo-123?ixid=credit&w=2000", 256),
    );
    expect(url.searchParams.get("w")).toBe("256");
    expect(url.searchParams.get("ixid")).toBe("credit");
    expect(url.searchParams.get("auto")).toBe("format");
  });
  it("does not alter signed URLs, Blob storage or unknown hosts", () => {
    for (const url of [
      "https://images.unsplash.com/photo?s=signature",
      "https://store.public.blob.vercel-storage.com/a.png",
      "https://example.com/a.jpg",
    ]) {
      expect(photoRendition(url, 256)).toBe(url);
      expect(
        recipePhotoSources({ name: "Soup", image_source: "AI", image_url: url }, "thumb").srcSet,
      ).toBeUndefined();
    }
  });
});
