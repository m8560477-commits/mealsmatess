import { createHash } from "node:crypto";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output, type ModelMessage } from "ai";
import { generateImage, generateSpeech } from "@tanstack/ai";
import {
  createLovableImage,
  createLovableSpeech,
  lovableGatewayHeaders,
  type LovableImageModel,
  type LovableTTSModel,
} from "@tanstack/ai-lovable";
import { z } from "zod";

export const DEFAULT_AI_TEXT_MODEL = "openai/gpt-oss-20b";
export const DEFAULT_LOVABLE_TEXT_MODEL = "google/gemini-3.7-flash";
export const DEFAULT_AI_IMAGE_MODEL: LovableImageModel = "openai/gpt-image-2";
export const DEFAULT_AI_SPEECH_MODEL: LovableTTSModel = "google/gemini-3.1-flash-tts-preview";

const LOVABLE_GATEWAY_BASE_URL = "https://ai.gateway.lovable.dev/v1";

const DEFAULT_TEXT_TIMEOUT_MS = 30_000;
const DEFAULT_IMAGE_TIMEOUT_MS = 90_000;
const DEFAULT_SPEECH_TIMEOUT_MS = 45_000;
const inFlightRequests = new Map<string, Promise<unknown>>();

type TextModel = Parameters<typeof generateText>[0]["model"];

type PromptInput =
  { prompt: string; messages?: never } | { messages: ModelMessage[]; prompt?: never };

type AiRequestOptions = {
  feature: string;
  provider?: "groq" | "lovable";
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  modelOverride?: TextModel;
  instructions?: string;
} & PromptInput;

export function getAiProviderConfiguration() {
  return {
    textProvider: "Groq" as const,
    textModel: DEFAULT_AI_TEXT_MODEL,
    lovableTextProvider: "Lovable AI Gateway" as const,
    lovableTextModel: DEFAULT_LOVABLE_TEXT_MODEL,
    imageProvider: "Lovable AI Gateway" as const,
    imageModel: DEFAULT_AI_IMAGE_MODEL,
    speechProvider: "Lovable AI Gateway" as const,
    speechModel: DEFAULT_AI_SPEECH_MODEL,
    authentication: "Provider credentials are read server-side" as const,
  };
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const statusCode =
    "statusCode" in error ? error.statusCode : "status" in error ? error.status : undefined;
  return typeof statusCode === "number" ? statusCode : undefined;
}

function errorCategory(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "";
  const status = errorStatus(error);
  if (/not configured|is required/i.test(message)) return "configuration_missing";
  if (/timeout|abort/i.test(name)) return "timeout";
  if (/credit|billing|payment/i.test(message) || status === 402) return "credits_unavailable";
  if (status === 401 || status === 403 || /authentication/i.test(name)) return "authentication";
  if (status === 429 || /rate.?limit/i.test(name)) return "rate_limited";
  if (status && status >= 500) return "provider_unavailable";
  return "request_failed";
}

function publicError(category: string, provider: "Groq" | "Lovable AI Gateway"): Error {
  const messages: Record<string, string> = {
    configuration_missing: `${provider} is not configured. Add its server-side API key in Vercel project settings.`,
    timeout: `${provider} took too long to respond. Please try again.`,
    credits_unavailable: `${provider} has no available credits or active billing for this request.`,
    authentication: `${provider} rejected its configured API key. Update the key in Vercel project settings.`,
    rate_limited: `${provider} is busy right now. Please try again shortly.`,
    provider_unavailable: `${provider} is temporarily unavailable. Please try again shortly.`,
    request_failed: `${provider} could not complete that request. Please try again.`,
    empty_response: `${provider} returned an empty response. Please try again.`,
    invalid_response: `${provider} returned a result that did not match the expected format.`,
  };
  return new Error(messages[category] ?? messages.request_failed);
}

function requireApiKey(name: "GROQ_API_KEY" | "LOVABLE_API_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function lovableLanguageModel(modelId: string): TextModel {
  const apiKey = requireApiKey("LOVABLE_API_KEY");
  return createOpenAICompatible({
    name: "lovable",
    baseURL: LOVABLE_GATEWAY_BASE_URL,
    headers: {
      ...lovableGatewayHeaders(apiKey),
      Authorization: `Bearer ${apiKey}`,
    },
    supportsStructuredOutputs: true,
  }).languageModel(modelId);
}

function logFailure(
  feature: string,
  provider: "Groq" | "Lovable AI Gateway",
  model: string,
  error: unknown,
  durationMs: number,
) {
  console.error("[MealMate AI] request failed", {
    provider,
    feature,
    model,
    durationMs,
    category: errorCategory(error),
    errorName: error instanceof Error ? error.name : "UnknownError",
    statusCode: errorStatus(error) ?? null,
  });
}

async function runTextRequest<T>(
  options: AiRequestOptions,
  generate: (model: TextModel, settings: { maxRetries: number; timeout: number }) => Promise<T>,
): Promise<T> {
  const aiProvider = options.provider ?? "groq";
  const provider = aiProvider === "groq" ? "Groq" : "Lovable AI Gateway";
  const modelId =
    options.model ?? (aiProvider === "groq" ? DEFAULT_AI_TEXT_MODEL : DEFAULT_LOVABLE_TEXT_MODEL);
  const startedAt = Date.now();
  try {
    const model =
      options.modelOverride ??
      (aiProvider === "groq"
        ? createGroq({ apiKey: requireApiKey("GROQ_API_KEY") })(modelId)
        : lovableLanguageModel(modelId));
    const result = await generate(model, {
      maxRetries: options.maxRetries ?? 1,
      timeout: options.timeoutMs ?? DEFAULT_TEXT_TIMEOUT_MS,
    });
    console.info("[MealMate AI] request completed", {
      provider,
      feature: options.feature,
      model: modelId,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    const category = errorCategory(error);
    logFailure(options.feature, provider, modelId, error, Date.now() - startedAt);
    throw publicError(category, provider);
  }
}

function promptFields(options: AiRequestOptions) {
  return {
    ...(options.instructions ? { instructions: options.instructions } : {}),
    ...(options.messages ? { messages: options.messages } : { prompt: options.prompt }),
  };
}

export async function generateAiText(options: AiRequestOptions): Promise<string> {
  const result = await runTextRequest(options, (model, settings) =>
    generateText({ model, ...promptFields(options), ...settings }),
  );
  const text = result.text.trim();
  if (!text)
    throw publicError(
      "empty_response",
      options.provider === "lovable" ? "Lovable AI Gateway" : "Groq",
    );
  return text;
}

export async function generateAiObject<TSchema extends z.ZodTypeAny>(
  options: AiRequestOptions & { schema: TSchema },
): Promise<z.output<TSchema>> {
  const result = await runTextRequest(options, (model, settings) =>
    generateText({
      model,
      ...promptFields(options),
      output: Output.object({ schema: options.schema }),
      ...settings,
    }),
  );
  try {
    return options.schema.parse(result.output) as z.output<TSchema>;
  } catch {
    throw publicError(
      "invalid_response",
      options.provider === "lovable" ? "Lovable AI Gateway" : "Groq",
    );
  }
}

export function imageInputFromDataUrl(value: string) {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(value);
  if (!match || !match[1] || !match[2]) throw new Error("A valid base64 image is required.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > 8 * 1024 * 1024) {
    throw new Error("Image must be smaller than 8 MB.");
  }
  return { bytes: new Uint8Array(bytes), mediaType: match[1].toLowerCase() };
}

export async function generateAiImage(
  prompt: string,
  options: {
    feature: string;
    size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
    timeoutMs?: number;
  },
) {
  const model = DEFAULT_AI_IMAGE_MODEL;
  const provider = "Lovable AI Gateway" as const;
  const startedAt = Date.now();
  try {
    const result = await generateImage({
      adapter: createLovableImage(model, requireApiKey("LOVABLE_API_KEY")),
      prompt,
      size: options.size ?? "1536x1024",
      modelOptions: { quality: "high", output_format: "png" },
      timeout: options.timeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS,
    });
    const image = result.images[0];
    if (!image) throw new Error("Lovable AI returned no image.");

    let bytes: Uint8Array;
    let mediaType = "image/png";
    if (image.b64Json) {
      bytes = new Uint8Array(Buffer.from(image.b64Json, "base64"));
    } else {
      if (!image.url) throw new Error("Lovable AI returned no image data.");
      const imageUrl = new URL(image.url);
      if (imageUrl.protocol !== "https:") throw new Error("Generated image URL must use HTTPS.");
      const response = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("Generated image could not be downloaded.");
      mediaType = response.headers.get("content-type")?.split(";")[0] ?? "image/png";
      if (!mediaType.startsWith("image/")) throw new Error("Generated asset was not an image.");
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    if (bytes.byteLength === 0 || bytes.byteLength > 20 * 1024 * 1024) {
      throw new Error("Generated image was empty or exceeded the storage size limit.");
    }

    console.info("[MealMate AI] image completed", {
      provider,
      feature: options.feature,
      model: result.model,
      durationMs: Date.now() - startedAt,
      byteLength: bytes.byteLength,
    });
    return { bytes, mediaType, model: result.model };
  } catch (error) {
    logFailure(options.feature, provider, model, error, Date.now() - startedAt);
    throw publicError(errorCategory(error), provider);
  }
}

export async function generateAiSpeech(
  text: string,
  options: { feature: string; voice?: string; timeoutMs?: number },
) {
  const model = DEFAULT_AI_SPEECH_MODEL;
  const provider = "Lovable AI Gateway" as const;
  const startedAt = Date.now();
  try {
    const result = await generateSpeech({
      adapter: createLovableSpeech(model, requireApiKey("LOVABLE_API_KEY")),
      text,
      voice: options.voice ?? "Kore",
      format: "mp3",
      timeout: options.timeoutMs ?? DEFAULT_SPEECH_TIMEOUT_MS,
    });
    const bytes = new Uint8Array(Buffer.from(result.audio, "base64"));
    console.info("[MealMate AI] speech completed", {
      provider,
      feature: options.feature,
      model: result.model,
      durationMs: Date.now() - startedAt,
      byteLength: bytes.byteLength,
    });
    return { bytes, mediaType: result.contentType ?? "audio/mpeg", model: result.model };
  } catch (error) {
    logFailure(options.feature, provider, model, error, Date.now() - startedAt);
    throw publicError(errorCategory(error), provider);
  }
}

export function aiRequestFingerprint(userId: string, feature: string, input: unknown): string {
  return createHash("sha256").update(JSON.stringify({ userId, feature, input })).digest("hex");
}

export function deduplicateAiRequest<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) return existing as Promise<T>;

  const request = run().finally(() => {
    if (inFlightRequests.get(key) === request) inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, request);
  return request;
}
