import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createGateway, generateImage, generateSpeech, generateText } from "ai";
import {
  generateAiText,
  generateAiObject,
  generateAiImage,
  generateAiSpeech,
  getAiProviderConfiguration,
} from "@/lib/ai-engine.server";

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  createGateway: vi.fn(),
  generateText: vi.fn(),
  generateImage: vi.fn(),
  generateSpeech: vi.fn(),
}));

const models = {
  languageModel: vi.fn(() => "text-model"),
  imageModel: vi.fn(() => "image-model"),
  speechModel: vi.fn(() => "speech-model"),
};

describe("Vercel AI Gateway integration", () => {
  beforeEach(() => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "local-test-key");
    vi.mocked(createGateway).mockReturnValue(models as unknown as ReturnType<typeof createGateway>);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["api-key", "oidc", "vercel-runtime"])(
    "recognizes %s configuration without publishing credentials",
    (mode) => {
      vi.stubEnv("AI_GATEWAY_API_KEY", mode === "api-key" ? "private-test-key" : "");
      vi.stubEnv("VERCEL_OIDC_TOKEN", mode === "oidc" ? "private-test-token" : "");
      vi.stubEnv("VERCEL", mode === "vercel-runtime" ? "1" : "");
      const config = getAiProviderConfiguration();
      expect(config.configured).toBe(true);
      expect(config.textProvider).toBe("Vercel AI Gateway");
      expect(JSON.stringify(config)).not.toMatch(/private-test/);
    },
  );

  it("sends Mia conversation history, instructions, and timeout to the SDK", async () => {
    vi.mocked(generateText).mockResolvedValue({ text: "Use oat milk and lemon juice." } as Awaited<
      ReturnType<typeof generateText>
    >);
    const messages = [{ role: "user" as const, content: "A dairy-free substitute?" }];
    expect(
      await generateAiText({
        feature: "chat.mia",
        instructions: "You are Mia.",
        messages,
        timeoutMs: 35_000,
        maxRetries: 0,
      }),
    ).toContain("oat milk");
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "text-model",
        instructions: "You are Mia.",
        messages,
        timeout: 35_000,
        maxRetries: 0,
      }),
    );
  });

  it("requests schema-constrained output and validates the returned recipe", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { name: "Toast", steps: [] },
    } as unknown as Awaited<ReturnType<typeof generateText>>);
    await expect(
      generateAiObject({
        feature: "recipe.generate",
        prompt: "Make breakfast.",
        schema: z.object({ name: z.string(), steps: z.array(z.string()).min(4) }),
      }),
    ).rejects.toThrow(/expected format/);
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ output: expect.any(Object) }),
    );
  });

  it("routes image and speech through the configured SDK models", async () => {
    vi.mocked(generateImage).mockResolvedValue({
      image: { uint8Array: new Uint8Array([1, 2, 3]), mediaType: "image/webp" },
    } as Awaited<ReturnType<typeof generateImage>>);
    vi.mocked(generateSpeech).mockResolvedValue({
      audio: { uint8Array: new Uint8Array([4, 5]), mediaType: "audio/mpeg" },
    } as Awaited<ReturnType<typeof generateSpeech>>);
    const image = await generateAiImage("Tomato toast", { feature: "recipe.image" });
    const speech = await generateAiSpeech("Toast the bread.", { feature: "visual.narration" });
    expect(image.mediaType).toBe("image/webp");
    expect([...speech.bytes]).toEqual([4, 5]);
    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "image-model",
        size: "1536x1024",
        abortSignal: expect.any(AbortSignal),
      }),
    );
    expect(generateSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ model: "speech-model", voice: "alloy", outputFormat: "mp3" }),
    );
  });

  it("supplies a JSON schema to Lovable for scan fields absent from the prompt", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "local-lovable-key");
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ choices: [{ message: { content: '{"items":[]}' } }] }));
    try {
      await generateAiObject({
        feature: "scan.kitchen",
        prompt: "Identify food.",
        schema: z.object({ items: z.array(z.object({ name: z.string(), quantity: z.string() })) }),
      });
      const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
      expect(body.messages[0].content).toContain('"quantity"');
      expect(body.messages[0].content).toContain('"required"');
    } finally {
      request.mockRestore();
    }
  });
});
