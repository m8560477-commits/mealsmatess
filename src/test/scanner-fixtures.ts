import type { z } from "zod";
import { ScanRecognitionSchema, ScanResultSchema, type ScanResult } from "@/lib/scanner";

// Synthetic fixtures for tests only; never imported by application code.
export const scanPhoto =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a7sAAAAASUVORK5CYII=";
export function recognition(): z.infer<typeof ScanRecognitionSchema> {
  return {
    is_food: true,
    name: "Test tomato bowl",
    description: null,
    confidence: null,
    nutrition: {
      basis: "One visible bowl (AI estimate)",
      calories: 120,
      protein_g: 4,
      carbs_g: 20,
      fat_g: 3,
      fiber_g: null,
    },
    ingredients: [{ name: "tomato", quantity: null, category: "vegetables" }],
    ingredient_evidence: "visible",
    allergens: [],
    allergen_evidence: "unknown",
    recipe: null,
  };
}
export function scanResult(): ScanResult {
  return ScanResultSchema.parse({
    ...recognition(),
    mode: "dish",
    source: "ai",
    barcode: null,
    ingredients_text: null,
    ingredient_source: "ai_observation",
    allergen_source: "unknown",
    traces: [],
    warnings: ["AI estimates are not verified."],
    checks: ["Response structure checked."],
  });
}
