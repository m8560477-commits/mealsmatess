import { describe, expect, it } from "vitest";
import { pantryRecipeQuery } from "@/lib/pantry-recipe";

describe("Pantry recipe generation", () => {
  it("passes available ingredients to the chef", () => {
    expect(pantryRecipeQuery(["chicken", "rice", "tomato"])).toBe("Make a meal using my pantry: chicken, rice, tomato. Prioritize these ingredients.");
  });
  it("does not generate a pretend pantry recipe when pantry is empty", () => {
    expect(pantryRecipeQuery([])).toBeNull();
  });
});