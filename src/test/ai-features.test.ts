import { afterEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import {
  DEFAULT_AI_IMAGE_MODEL,
  DEFAULT_AI_SPEECH_MODEL,
  DEFAULT_AI_TEXT_MODEL,
  aiRequestFingerprint,
  deduplicateAiRequest,
  generateAiObject,
  generateAiText,
  getAiGatewayConfiguration,
  imageInputFromDataUrl,
} from "@/lib/ai-engine.server";
import { z } from "zod";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 12, text: 12, reasoning: undefined },
};

function textModel(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage,
      warnings: [],
    }),
  });
}

describe("shared MealMate AI engine", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses current configured Vercel AI Gateway models without exposing credentials", () => {
    const config = getAiGatewayConfiguration();
    expect(config).toMatchObject({
      provider: "Vercel AI Gateway",
      textModel: DEFAULT_AI_TEXT_MODEL,
      imageModel: DEFAULT_AI_IMAGE_MODEL,
      speechModel: DEFAULT_AI_SPEECH_MODEL,
    });
    expect(JSON.stringify(config)).not.toMatch(/key|token|secret/i);
  });

  it("returns generated text through the shared model wrapper", async () => {
    const text = await generateAiText({
      feature: "test.mia",
      modelOverride: textModel("A tablespoon of lemon juice mixed into a cup of milk works well."),
      prompt: "How can I replace buttermilk?",
    });
    expect(text).toContain("lemon juice");
  });

  it("parses and validates structured recipe output", async () => {
    const schema = z.object({
      name: z.string(),
      ingredients: z.array(z.string()).min(3),
      steps: z.array(z.string()).min(2),
    });
    const result = await generateAiObject({
      feature: "test.recipe",
      modelOverride: textModel(
        JSON.stringify({
          name: "Tomato egg toast",
          ingredients: ["eggs", "tomatoes", "bread"],
          steps: ["Toast bread", "Cook eggs with tomatoes"],
        }),
      ),
      prompt: "Create a simple recipe.",
      schema,
    });
    expect(result.name).toBe("Tomato egg toast");
    expect(result.ingredients).toHaveLength(3);
  });

  it("rejects malformed structured model output instead of saving it", async () => {
    await expect(
      generateAiObject({
        feature: "test.recipe.invalid",
        modelOverride: textModel(JSON.stringify({ name: "No ingredients" })),
        prompt: "Create a recipe.",
        schema: z.object({ name: z.string(), ingredients: z.array(z.string()).min(2) }),
      }),
    ).rejects.toThrow();
  });

  it("rejects empty assistant responses", async () => {
    await expect(
      generateAiText({ feature: "test.empty", modelOverride: textModel("  "), prompt: "Reply." }),
    ).rejects.toThrow(/empty response/i);
  });

  it("maps image data URLs to bounded bytes and validates MIME types", () => {
    const image = imageInputFromDataUrl(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a7sAAAAASUVORK5CYII=",
    );
    expect(image.mediaType).toBe("image/png");
    expect(image.bytes.byteLength).toBeGreaterThan(0);
    expect(() => imageInputFromDataUrl("data:text/plain;base64,aGVsbG8=")).toThrow(
      /valid base64 image/i,
    );
  });

  it("coalesces concurrent identical requests and fingerprints user-scoped inputs", async () => {
    const key = aiRequestFingerprint("user-a", "recipe", "eggs,tomato,bread");
    const sameKey = aiRequestFingerprint("user-a", "recipe", "eggs,tomato,bread");
    const otherUserKey = aiRequestFingerprint("user-b", "recipe", "eggs,tomato,bread");
    expect(key).toBe(sameKey);
    expect(key).not.toBe(otherUserKey);

    const run = vi.fn(async () => {
      await Promise.resolve();
      return "one provider call";
    });
    const [first, second] = await Promise.all([
      deduplicateAiRequest(key, run),
      deduplicateAiRequest(key, run),
    ]);
    expect(first).toBe(second);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
