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

export const DEFAULT_AI_TEXT_MODEL = "google/gemini-3.8-flash";
export const DEFAULT_AI_IMAGE_MODEL = "openai/gpt-image-2.5-flare";
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

function configuredModel(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export function getAiGatewayConfiguration() {
  return {
    provider: "Vercel AI Gateway" as const,
    textModel: configuredModel("MEALMATE_AI_TEXT_MODEL", DEFAULT_AI_TEXT_MODEL),
    imageModel: configuredModel("MEALMATE_AI_IMAGE_MODEL", DEFAULT_AI_IMAGE_MODEL),
    speechModel: configuredModel("MEALMATE_AI_SPEECH_MODEL", DEFAULT_AI_SPEECH_MODEL),
    authentication: "Managed server-side by the Vercel AI Gateway" as const,
  };
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  const statusCode = error.statusCode;
  return typeof statusCode === "number" ? statusCode : undefined;
}

function errorCategory(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "";
  const status = errorStatus(error);
  if (/timeout|abort/i.test(name)) return "timeout";
  if (/credit|billing|payment/i.test(message) || status === 402) return "credits_unavailable";
  if (status === 401 || status === 403 || /authentication/i.test(name)) return "authentication";
  if (status === 429 || /rate.?limit/i.test(name)) return "rate_limited";
  if (status && status >= 500) return "provider_unavailable";
  return "request_failed";
}

function publicError(category: string): Error {
  const messages: Record<string, string> = {
    timeout: "MealMate AI took too long to respond. Please try again.",
    credits_unavailable:
      "MealMate AI Gateway needs active credits and billing before it can process requests.",
    authentication:
      "MealMate AI Gateway authentication is unavailable. Check the project connection.",
    rate_limited: "MealMate AI is busy right now. Please try again shortly.",
    provider_unavailable: "MealMate AI is temporarily unavailable. Please try again shortly.",
    request_failed: "MealMate AI could not complete that request. Please try again.",
    empty_response: "MealMate AI returned an empty response. Please try again.",
    invalid_response: "MealMate AI returned a result that did not match the expected format.",
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
  const modelId = options.model ?? getAiGatewayConfiguration().textModel;
  const startedAt = Date.now();
  try {
    const result = await generate(options.modelOverride ?? gateway(modelId), {
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
    return options.schema.parse(result.output);
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
    size?: `${number}x${number}`;
    timeoutMs?: number;
    maxRetries?: number;
  },
) {
  const model = configuredModel("MEALMATE_AI_IMAGE_MODEL", DEFAULT_AI_IMAGE_MODEL);
  const startedAt = Date.now();
  try {
    const { image } = await generateImage({
      model: gateway.image(model),
      prompt,
      ...(options.size ? { size: options.size } : {}),
      maxRetries: options.maxRetries ?? 1,
      abortSignal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS),
    });
    console.info("[MealMate AI] image completed", {
      provider: "Vercel AI Gateway",
      feature: options.feature,
      model,
      durationMs: Date.now() - startedAt,
      byteLength: image.uint8Array.byteLength,
    });
    return { bytes: image.uint8Array, mediaType: image.mediaType || "image/png", model };
  } catch (error) {
    logFailure(options.feature, model, error, Date.now() - startedAt);
    throw publicError(errorCategory(error));
  }
}

export async function generateAiSpeech(
  text: string,
  options: { feature: string; voice?: string; timeoutMs?: number; maxRetries?: number },
) {
  const model = configuredModel("MEALMATE_AI_SPEECH_MODEL", DEFAULT_AI_SPEECH_MODEL);
  const startedAt = Date.now();
  try {
    const result = await generateSpeech({
      model: gateway.speech(model),
      text,
      voice: options.voice ?? "Kore",
      outputFormat: "mp3",
      maxRetries: options.maxRetries ?? 1,
      abortSignal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_SPEECH_TIMEOUT_MS),
    });
    console.info("[MealMate AI] speech completed", {
      provider: "Vercel AI Gateway",
      feature: options.feature,
      model,
      durationMs: Date.now() - startedAt,
      byteLength: result.audio.uint8Array.byteLength,
    });
    return {
      bytes: result.audio.uint8Array,
      mediaType: result.audio.mediaType || "audio/mpeg",
      model,
    };
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
