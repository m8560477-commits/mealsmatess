import { createHash } from "node:crypto";
import {
  generateImage,
  generateSpeech,
  generateText,
  gateway,
  Output,
  type ModelMessage,
} from "ai";
import { z } from "zod";

export const DEFAULT_AI_TEXT_MODEL = "google/gemini-3.7-flash";
export const DEFAULT_AI_IMAGE_MODEL = "openai/gpt-image-2";
export const DEFAULT_AI_SPEECH_MODEL = "google/gemini-3.8-flash-tts";

const DEFAULT_TEXT_TIMEOUT_MS = 30_000;
const DEFAULT_IMAGE_TIMEOUT_MS = 90_000;
const DEFAULT_SPEECH_TIMEOUT_MS = 45_000;
const inFlightRequests = new Map<string, Promise<unknown>>();

type TextModel = Parameters<typeof generateText>[0]["model"];

type PromptInput =
  { prompt: string; messages?: never } | { messages: ModelMessage[]; prompt?: never };

type AiRequestOptions = {
  feature: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  modelOverride?: TextModel;
  instructions?: string;
} & PromptInput;

export function getAiProviderConfiguration() {
  return {
    textProvider: "Vercel AI Gateway" as const,
    textModel: DEFAULT_AI_TEXT_MODEL,
    imageProvider: "Vercel AI Gateway" as const,
    imageModel: DEFAULT_AI_IMAGE_MODEL,
    speechProvider: "Vercel AI Gateway" as const,
    speechModel: DEFAULT_AI_SPEECH_MODEL,
    authentication: "Vercel-managed OIDC; credentials stay server-side" as const,
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
  if (/not configured|authentication.*unavailable/i.test(message)) return "configuration_missing";
  if (/timeout|abort/i.test(name)) return "timeout";
  if (/credit|billing|payment/i.test(message) || status === 402) return "credits_unavailable";
  if (status === 401 || status === 403 || /authentication/i.test(name)) return "authentication";
  if (status === 429 || /rate.?limit/i.test(name)) return "rate_limited";
  if (status && status >= 500) return "provider_unavailable";
  return "request_failed";
}

function publicError(category: string): Error {
  const messages: Record<string, string> = {
    configuration_missing:
      "Vercel AI Gateway authentication is unavailable in this runtime. Deploy through Vercel with the AI Gateway connected.",
    timeout: "Vercel AI Gateway took too long to respond. Please try again.",
    credits_unavailable: "Vercel AI Gateway has no available credits for this request.",
    authentication:
      "Vercel AI Gateway rejected this request. Check the project Gateway connection.",
    rate_limited: "Vercel AI Gateway is busy right now. Please try again shortly.",
    provider_unavailable: "Vercel AI Gateway is temporarily unavailable. Please try again shortly.",
    request_failed: "Vercel AI Gateway could not complete that request. Please try again.",
    empty_response: "Vercel AI Gateway returned an empty response. Please try again.",
    invalid_response: "Vercel AI Gateway returned a result that did not match the expected format.",
  };
  return new Error(messages[category] ?? messages.request_failed);
}

function logFailure(feature: string, model: string, error: unknown, durationMs: number) {
  console.error("[MealMate AI] request failed", {
    provider: "Vercel AI Gateway",
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
  const modelId = options.model ?? DEFAULT_AI_TEXT_MODEL;
  const startedAt = Date.now();
  try {
    const model = options.modelOverride ?? gateway(modelId);
    const result = await generate(model, {
      maxRetries: options.maxRetries ?? 1,
      timeout: options.timeoutMs ?? DEFAULT_TEXT_TIMEOUT_MS,
    });
    console.info("[MealMate AI] request completed", {
      provider: "Vercel AI Gateway",
      feature: options.feature,
      model: modelId,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    const category = errorCategory(error);
    logFailure(options.feature, modelId, error, Date.now() - startedAt);
    throw publicError(category);
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
  if (!text) throw publicError("empty_response");
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
    throw publicError("invalid_response");
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
    size?: "1024x1024" | "1536x1024" | "1024x1536";
    timeoutMs?: number;
  },
) {
  const model = DEFAULT_AI_IMAGE_MODEL;
  const startedAt = Date.now();
  try {
    const result = await generateImage({
      model: gateway.imageModel(model),
      prompt,
      size: options.size ?? "1536x1024",
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS),
    });
    const bytes = new Uint8Array(result.image.uint8Array);
    const mediaType = result.image.mediaType;
    if (bytes.byteLength === 0 || bytes.byteLength > 20 * 1024 * 1024) {
      throw new Error("Generated image was empty or exceeded the storage size limit.");
    }
    if (!mediaType.startsWith("image/")) throw new Error("Gateway returned a non-image response.");

    console.info("[MealMate AI] image completed", {
      provider: "Vercel AI Gateway",
      feature: options.feature,
      model,
      durationMs: Date.now() - startedAt,
      byteLength: bytes.byteLength,
    });
    return { bytes, mediaType, model };
  } catch (error) {
    logFailure(options.feature, model, error, Date.now() - startedAt);
    throw publicError(errorCategory(error));
  }
}

export async function generateAiSpeech(
  text: string,
  options: { feature: string; voice?: string; timeoutMs?: number },
) {
  const model = DEFAULT_AI_SPEECH_MODEL;
  const startedAt = Date.now();
  try {
    const result = await generateSpeech({
      model: gateway.speechModel(model),
      text,
      voice: options.voice ?? "Kore",
      abortSignal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_SPEECH_TIMEOUT_MS),
    });
    const bytes = new Uint8Array(result.audio.uint8Array);
    if (bytes.byteLength === 0 || bytes.byteLength > 20 * 1024 * 1024) {
      throw new Error("Generated audio was empty or exceeded the storage size limit.");
    }
    console.info("[MealMate AI] speech completed", {
      provider: "Vercel AI Gateway",
      feature: options.feature,
      model,
      durationMs: Date.now() - startedAt,
      byteLength: bytes.byteLength,
    });
    return { bytes, mediaType: result.audio.mediaType, model };
  } catch (error) {
    logFailure(options.feature, model, error, Date.now() - startedAt);
    throw publicError(errorCategory(error));
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
