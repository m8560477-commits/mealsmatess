import { z } from "zod";

export const SCAN_STEPS = [
  { id: "reading", label: "Reading scan" },
  { id: "identifying", label: "Identifying item" },
  { id: "nutrition", label: "Checking nutrition" },
  { id: "ingredients", label: "Checking ingredients" },
  { id: "verifying", label: "Verifying results" },
  { id: "preparing", label: "Preparing results" },
] as const;
export type ScanStepId = (typeof SCAN_STEPS)[number]["id"];
export type ScanStepState = "waiting" | "active" | "completed" | "attention" | "failed";
export type ScanProgress = Record<ScanStepId, { status: ScanStepState; message: string }>;
export function initialScanProgress(): ScanProgress {
  return Object.fromEntries(
    SCAN_STEPS.map(({ id }) => [id, { status: "waiting", message: "Waiting" }]),
  ) as ScanProgress;
}

export const ScanModeSchema = z.enum(["dish", "ingredients", "recipe", "barcode"]);
export type ScanMode = z.infer<typeof ScanModeSchema>;

/** Only product identifiers are accepted. QR links are decoded, never opened or fetched. */
export function productCode(value: string): string | null {
  let code = value.trim();
  if (code.startsWith("https://")) {
    try {
      code = new URL(code).pathname.match(/^\/01\/(\d{14})(?:\/|$)/)?.[1] ?? "";
    } catch {
      return null;
    }
  }
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return null;
  const digits = code.split("").map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((total, digit, i) => total + digit * (i % 2 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === check ? code : null;
}

export const MAX_SCAN_BODY_BYTES = 2_900_000;
export const ScanInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
    mode: z.enum(["dish", "ingredients", "recipe"]),
    imageDataUrl: z
      .string()
      .max(2_800_000)
      .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
  }),
  z.object({
    kind: z.literal("barcode"),
    code: z
      .string()
      .max(512)
      .refine((v) => productCode(v) !== null, "Enter a valid EAN, UPC or GTIN product code."),
  }),
]);
export type ScanInput = z.infer<typeof ScanInputSchema>;

const nutrient = z.number().finite().min(0).max(10_000).nullable();
export const ScanNutritionSchema = z.object({
  basis: z.string().trim().min(1).max(180),
  calories: nutrient,
  protein_g: z.number().finite().min(0).max(1000).nullable(),
  carbs_g: z.number().finite().min(0).max(1000).nullable(),
  fat_g: z.number().finite().min(0).max(1000).nullable(),
  fiber_g: z.number().finite().min(0).max(1000).nullable(),
});
export const ScanItemSchema = z.object({
  name: z.string().trim().min(1).max(180),
  quantity: z.string().max(80).nullable(),
  category: z.string().max(60).nullable(),
});
export const ScanRecipeSchema = z.object({
  servings: z.number().int().min(1).max(100).nullable(),
  steps: z.array(z.string().trim().min(1).max(1500)).min(1).max(40),
});

/** No default confidence, nutrition, ingredients or successful recognition. */
export const ScanRecognitionSchema = z.object({
  is_food: z.boolean(),
  name: z.string().trim().min(1).max(180),
  description: z.string().max(1000).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  nutrition: ScanNutritionSchema.nullable(),
  ingredients: z.array(ScanItemSchema).max(60),
  ingredient_evidence: z.enum(["visible", "label", "recipe", "unknown"]),
  allergens: z.array(z.string().trim().min(1).max(100)).max(30),
  allergen_evidence: z.enum(["label", "unknown"]),
  recipe: ScanRecipeSchema.nullable(),
});
export const ScanResultSchema = ScanRecognitionSchema.omit({
  is_food: true,
  ingredient_evidence: true,
  allergen_evidence: true,
}).extend({
  mode: ScanModeSchema,
  source: z.enum(["ai", "open_food_facts"]),
  barcode: z.string().nullable(),
  ingredients_text: z.string().max(12_000).nullable(),
  ingredient_source: z.enum(["ai_observation", "ai_transcription", "database", "unknown"]),
  allergen_source: z.enum(["ai_label", "database", "unknown"]),
  traces: z.array(z.string().max(100)).max(30),
  warnings: z.array(z.string().max(500)).max(30),
  checks: z.array(z.string().max(500)).max(20),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;
export const ScanEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("step"),
    id: z.enum(["reading", "identifying", "nutrition", "ingredients", "verifying", "preparing"]),
    status: z.enum(["active", "completed", "attention", "failed"]),
    message: z.string().max(500),
  }),
  z.object({ type: z.literal("result"), result: ScanResultSchema }),
  z.object({ type: z.literal("error"), message: z.string().max(500) }),
]);
export type ScanEvent = z.infer<typeof ScanEventSchema>;

export function hasNutrition(nutrition: ScanResult["nutrition"]) {
  return (
    nutrition !== null &&
    Object.entries(nutrition).some(([key, value]) => key !== "basis" && typeof value === "number")
  );
}
