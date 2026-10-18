import { afterEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import {
  DEFAULT_AI_IMAGE_MODEL,
  DEFAULT_AI_SPEECH_MODEL,
  DEFAULT_AI_TEXT_MODEL,
  aiRequestFingerprint,
  deduplicateAiRequest,
  generateAiImage,
  generateAiObject,
  generateAiSpeech,
  generateAiText,
  getAiProviderConfiguration,
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

function mockFetch(response: Response) {
  const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response);
  vi.stubGlobal("fetch", request);
  return request;
}

describe("shared MealMate AI engine", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reports Lovable Gateway models without exposing credentials", () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    const config = getAiProviderConfiguration();
    expect(config).toMatchObject({
      textProvider: "Lovable AI Gateway",
      textModel: DEFAULT_AI_TEXT_MODEL,
      imageProvider: "Lovable AI Gateway",
      imageModel: DEFAULT_AI_IMAGE_MODEL,
      speechProvider: "Lovable AI Gateway",
      speechModel: DEFAULT_AI_SPEECH_MODEL,
    });
    expect(JSON.stringify(config)).not.toMatch(/secret|token|test-key/i);
  });

  it("fails clearly when server credentials are missing", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("VERCEL", "");
    await expect(
      generateAiText({ feature: "test.unconfigured", prompt: "Reply." }),
    ).rejects.toThrow(/not configured/i);
  });

  it("returns generated text through the shared model wrapper", async () => {
    const text = await generateAiText({
      feature: "test.mia",
      modelOverride: textModel("A tablespoon of lemon juice mixed into a cup of milk works well."),
      prompt: "How can I replace buttermilk?",
    });
    expect(text).toContain("lemon juice");
  });

  it("sends text requests to the server-authenticated Lovable Gateway", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    const request = mockFetch(
      Response.json({ choices: [{ message: { content: "Try lemon juice and milk." } }] }),
    );

    const text = await generateAiText({ feature: "test.gateway", prompt: "Suggest a substitute." });

    expect(text).toBe("Try lemon juice and milk.");
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-key");
    expect(new Headers(init.headers).get("Lovable-API-Key")).toBe("test-key");
  });

  it("serializes image messages for ingredient scanning", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    const request = mockFetch(
      Response.json({ choices: [{ message: { content: '{"items":[]}' } }] }),
    );

    await generateAiObject({
      feature: "test.vision",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Identify the ingredients." },
            { type: "image", image: new Uint8Array([1, 2, 3]), mediaType: "image/png" },
          ],
        },
      ],
      schema: z.object({ items: z.array(z.string()) }),
    });

    const [, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      messages: { content: string | { type: string; image_url?: { url: string } }[] }[];
    };
    expect(
      (body.messages.at(-1)?.content as { image_url?: { url: string } }[])[1]?.image_url?.url,
    ).toBe("data:image/png;base64,AQID");
  });

  it("parses and validates structured recipe output from the Gateway", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    mockFetch(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: "Tomato egg toast",
                ingredients: ["eggs", "tomatoes", "bread"],
                steps: ["Toast bread", "Cook eggs with tomatoes"],
              }),
            },
          },
        ],
      }),
    );
    const schema = z.object({
      name: z.string(),
      ingredients: z.array(z.string()).min(3),
      steps: z.array(z.string()).min(2),
    });

    const result = await generateAiObject({
      feature: "test.recipe",
      prompt: "Create a simple recipe.",
      schema,
    });

    expect(result.name).toBe("Tomato egg toast");
    expect(result.ingredients).toHaveLength(3);
  });

  it("rejects malformed structured model output instead of saving it", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    mockFetch(Response.json({ choices: [{ message: { content: '{"name":"No ingredients"}' } }] }));
    await expect(
      generateAiObject({
        feature: "test.recipe.invalid",
        prompt: "Create a recipe.",
        schema: z.object({ name: z.string(), ingredients: z.array(z.string()).min(2) }),
      }),
    ).rejects.toThrow(/expected format/i);
  });

  it("rejects empty assistant responses", async () => {
    await expect(
      generateAiText({ feature: "test.empty", modelOverride: textModel("  "), prompt: "Reply." }),
    ).rejects.toThrow(/empty response/i);
  });

  it("uses Lovable image and speech endpoints with bounded output", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    const imageBytes = Buffer.from("test image");
    const imageRequest = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      // GPT image models always return base64 and reject the legacy format parameter.
      if ("response_format" in body)
        return Response.json(
          { error: { code: "unknown_parameter", param: "response_format" } },
          { status: 400 },
        );
      return Response.json({
        data: [{ b64_json: imageBytes.toString("base64"), mime_type: "image/png" }],
      });
    });
    vi.stubGlobal("fetch", imageRequest);
    const image = await generateAiImage("A tomato omelet", { feature: "test.image" });
    expect(Buffer.from(image.bytes).toString()).toBe("test image");
    expect(image.mediaType).toBe("image/png");
    expect(String(imageRequest.mock.calls[0]?.[0])).toBe(
      "https://ai.gateway.lovable.dev/v1/images/generations",
    );

    const audioRequest = mockFetch(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const audio = await generateAiSpeech("Welcome to MealMate", { feature: "test.speech" });
    expect([...audio.bytes]).toEqual([1, 2, 3]);
    expect(audio.mediaType).toBe("audio/mpeg");
    expect(String(audioRequest.mock.calls[0]?.[0])).toBe(
      "https://ai.gateway.lovable.dev/v1/audio/speech",
    );
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
