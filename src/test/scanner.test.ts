import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeScan, lookupScanProduct } from "@/lib/scanner.server";
import { productCode, ScanInputSchema, ScanRecognitionSchema, type ScanEvent } from "@/lib/scanner";
import { recognition, scanPhoto } from "./scanner-fixtures";
const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/ai-engine.server", async (original) => ({
  ...(await original<typeof import("@/lib/ai-engine.server")>()),
  generateAiObject: mocks.generate,
}));
beforeEach(() => {
  mocks.generate.mockReset();
  mocks.generate.mockResolvedValue(recognition());
});
afterEach(() => vi.unstubAllGlobals());
const imageInput = { kind: "image", mode: "dish", imageDataUrl: scanPhoto } as const;
const signal = () => new AbortController().signal;

describe("scan identifiers and input limits", () => {
  it.each(["3017620422003", "012345678905", "96385074", "03017620422003"])(
    "accepts valid product checksum %s",
    (code) => expect(productCode(code)).toBe(code),
  );
  it.each([
    "3017620422004",
    "123",
    "https://example.com",
    "javascript:alert(1)",
    "hello 3017620422003",
  ])("rejects unsupported payload %s", (code) => expect(productCode(code)).toBeNull());
  it("extracts a GS1 QR identifier without opening its URL", () =>
    expect(productCode("https://id.gs1.org/01/03017620422003/10/batch")).toBe("03017620422003"));
  it("rejects unsupported images and oversized inputs", () => {
    expect(
      ScanInputSchema.safeParse({ ...imageInput, imageDataUrl: "https://example.com/photo.jpg" })
        .success,
    ).toBe(false);
    expect(
      ScanInputSchema.safeParse({
        ...imageInput,
        imageDataUrl: "data:image/svg+xml;base64,PHN2Zz4=",
      }).success,
    ).toBe(false);
    expect(
      ScanInputSchema.safeParse({
        ...imageInput,
        imageDataUrl: "data:image/jpeg;base64," + "A".repeat(2_800_000),
      }).success,
    ).toBe(false);
  });
  it("does not invent confidence or a successful food flag", () => {
    const data = recognition();
    expect(ScanRecognitionSchema.safeParse({ ...data, confidence: undefined }).success).toBe(false);
    expect(ScanRecognitionSchema.safeParse({ ...data, is_food: undefined }).success).toBe(false);
  });
});

describe("real-operation analysis pipeline", () => {
  it("keeps identification active until the provider resolves", async () => {
    let finish!: (value: ReturnType<typeof recognition>) => void;
    mocks.generate.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const events: ScanEvent[] = [];
    const pending = analyzeScan(imageInput, (e) => events.push(e), signal());
    expect(events.at(-1)).toMatchObject({ id: "identifying", status: "active" });
    expect(events.some((e) => e.type === "step" && e.id === "nutrition")).toBe(false);
    finish(recognition());
    const result = await pending;
    expect(result.confidence).toBeNull();
    expect(result.source).toBe("ai");
    expect(result.allergen_source).toBe("unknown");
    expect(events).toContainEqual(
      expect.objectContaining({ id: "ingredients", status: "attention" }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ id: "verifying", status: "attention" }),
    );
    expect(events.at(-1)?.type).toBe("result");
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: expect.any(AbortSignal), maxRetries: 0 }),
    );
  });
  it("never reports checks after recognition fails", async () => {
    mocks.generate.mockRejectedValue(new Error("provider failed"));
    const events: ScanEvent[] = [];
    await expect(analyzeScan(imageInput, (e) => events.push(e), signal())).rejects.toThrow(
      "provider failed",
    );
    expect(events.at(-1)).toMatchObject({ id: "identifying", status: "failed" });
    expect(events.some((e) => e.type === "step" && e.id === "verifying")).toBe(false);
  });
  it("rejects non-food and unreadable recipe scans", async () => {
    mocks.generate.mockResolvedValue({ ...recognition(), is_food: false });
    await expect(analyzeScan(imageInput, () => {}, signal())).rejects.toThrow(/identify food/);
    mocks.generate.mockResolvedValue(recognition());
    await expect(
      analyzeScan({ ...imageInput, mode: "recipe" }, () => {}, signal()),
    ).rejects.toThrow(/recipe text/);
  });
  it("retains actual recipe transcription without generating steps", async () => {
    mocks.generate.mockResolvedValue({
      ...recognition(),
      ingredient_evidence: "recipe",
      recipe: { servings: null, steps: ["Slice the tomato."] },
    });
    const result = await analyzeScan({ ...imageInput, mode: "recipe" }, () => {}, signal());
    expect(result.recipe).toEqual({ servings: null, steps: ["Slice the tomato."] });
    expect(result.ingredient_source).toBe("ai_transcription");
  });
  it("withholds unsupported allergens and ingredient nutrition", async () => {
    mocks.generate.mockResolvedValue({
      ...recognition(),
      allergens: ["milk"],
      allergen_evidence: "unknown",
    });
    const events: ScanEvent[] = [];
    const result = await analyzeScan(
      { ...imageInput, mode: "ingredients" },
      (e) => events.push(e),
      signal(),
    );
    expect(result.allergens).toEqual([]);
    expect(result.nutrition).toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({ id: "nutrition", status: "attention" }),
    );
  });
  it("rejects invalid negative nutrition", async () => {
    mocks.generate.mockResolvedValue({
      ...recognition(),
      nutrition: { ...recognition().nutrition, calories: -10 },
    });
    await expect(analyzeScan(imageInput, () => {}, signal())).rejects.toThrow();
  });
  it("stops emitting success after cancellation", async () => {
    const controller = new AbortController();
    mocks.generate.mockImplementation(async () => {
      controller.abort();
      return recognition();
    });
    const events: ScanEvent[] = [];
    await expect(
      analyzeScan(imageInput, (e) => events.push(e), controller.signal),
    ).rejects.toThrow();
    expect(events.some((e) => e.type === "result")).toBe(false);
  });
});

describe("Open Food Facts mapping", () => {
  const product = {
    code: "3017620422003",
    product_name: "Synthetic product",
    nutriments: { "energy-kcal_100g": 500, proteins_100g: 8, carbohydrates_100g: 50, fat_100g: 30 },
    ingredients_text: "Test ingredients",
    allergens_tags: ["en:milk"],
    traces_tags: ["en:peanuts"],
  };
  it("maps database information without generating a confidence score", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ status: 1, product }));
    vi.stubGlobal("fetch", fetcher);
    const result = await analyzeScan({ kind: "barcode", code: product.code }, () => {}, signal());
    expect(result).toMatchObject({
      source: "open_food_facts",
      confidence: null,
      allergens: ["milk"],
      traces: ["peanuts"],
      ingredient_source: "database",
      nutrition: { calories: 500 },
    });
    expect(result.nutrition?.basis).toContain("100 g");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(String(fetcher.mock.calls[0][0])).toMatch(
      /^https:\/\/world.openfoodfacts.org\/api\/v2\/product\/3017620422003.json/,
    );
  });
  it("withholds an oversized nutrient while preserving valid database information", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          status: 1,
          product: { ...product, nutriments: { "energy-kcal_100g": 500, proteins_100g: 1500 } },
        }),
      ),
    );
    const result = await analyzeScan({ kind: "barcode", code: product.code }, () => {}, signal());
    expect(result.nutrition?.calories).toBe(500);
    expect(result.nutrition?.protein_g).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it("withholds inconsistent macro totals and unknown allergen claims", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          status: 1,
          product: {
            ...product,
            allergens_tags: [],
            nutriments: { proteins_100g: 100, carbohydrates_100g: 100, fat_100g: 100 },
          },
        }),
      ),
    );
    const result = await analyzeScan({ kind: "barcode", code: product.code }, () => {}, signal());
    expect(result.nutrition).toBeNull();
    expect(result.allergen_source).toBe("unknown");
    expect(result.warnings.join(" ")).toContain("withheld");
  });
  it.each([
    Response.json({ status: 0 }),
    Response.json({ status: 1, product: { ...product, code: "96385074" } }),
    new Response(null, { status: 503 }),
  ])("handles missing, mismatched or unavailable product records", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(lookupScanProduct(product.code, signal())).rejects.toThrow();
  });
});
