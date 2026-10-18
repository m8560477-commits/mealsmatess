import { createHash } from "node:crypto";
import {
  createGateway,
  generateImage,
  generateSpeech,
  generateText,
  Output,
  zodSchema,
  type ModelMessage,
} from "ai";
import { z } from "zod";

export const DEFAULT_AI_TEXT_MODEL = "google/gemini-2.5-flash";
export const DEFAULT_AI_IMAGE_MODEL = "openai/gpt-image-2";
export const DEFAULT_AI_SPEECH_MODEL = "openai/gpt-4o-mini-tts";

const LOVABLE_AI_BASE_URL = "https://ai.gateway.lovable.dev/v1";
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
type LovableContentPart =
  { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type LovableMessage = {
  role: "system" | "user" | "assistant";
  content: string | LovableContentPart[];
};

class AiProviderError extends Error {
  constructor(
    readonly category: string,
    readonly statusCode?: number,
  ) {
    super(category);
    this.name = "AiProviderError";
  }
}

function usesLovableGateway() {
  return Boolean(process.env["LOVABLE_API_KEY"]);
}

export function getAiProviderConfiguration() {
  const lovable = usesLovableGateway();
  const provider = lovable ? "Lovable AI Gateway" : "Vercel AI Gateway";
  return {
    textProvider: provider,
    textModel: DEFAULT_AI_TEXT_MODEL,
    imageProvider: provider,
    imageModel: DEFAULT_AI_IMAGE_MODEL,
    speechProvider: provider,
    speechModel: DEFAULT_AI_SPEECH_MODEL,
    authentication: lovable ? "Server-only credentials" : "Server API key or Vercel OIDC",
    configured:
      lovable ||
      Boolean(
        process.env["AI_GATEWAY_API_KEY"] ||
        process.env["VERCEL_OIDC_TOKEN"] ||
        process.env["VERCEL"] === "1",
      ),
  };
}

function vercelGateway() {
  if (!getAiProviderConfiguration().configured) throw new AiProviderError("configuration_missing");
  // The SDK handles Vercel's request-scoped OIDC token and local API keys.
  return createGateway();
}

function errorStatus(error: unknown): number | undefined {
  if (error instanceof AiProviderError) return error.statusCode;
  if (typeof error !== "object" || error === null) return undefined;
  const statusCode =
    "statusCode" in error ? error.statusCode : "status" in error ? error.status : undefined;
  return typeof statusCode === "number" ? statusCode : undefined;
}

function errorCategory(error: unknown): string {
  if (error instanceof AiProviderError) return error.category;
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "";
  const status = errorStatus(error);
  if (/not configured|LOVABLE_API_KEY|AI_GATEWAY_API_KEY/i.test(message))
    return "configuration_missing";
  if (/timeout|abort/i.test(name)) return "timeout";
  if (/credit|billing|payment/i.test(message) || status === 402) return "credits_unavailable";
  if (status === 401 || status === 403 || /authentication/i.test(name)) return "authentication";
  if (status === 429 || /rate.?limit/i.test(name)) return "rate_limited";
  if (status && status >= 500) return "provider_unavailable";
  return "request_failed";
}

function publicError(category: string): Error {
  const messages: Record<string, string> = {
    configuration_missing: "MealMate AI is not configured for this server runtime.",
    timeout: "MealMate AI took too long to respond. Please try again.",
    credits_unavailable: "MealMate AI has no available credits for this request.",
    authentication: "MealMate AI rejected its server credentials. Please check the provider setup.",
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
    provider: getAiProviderConfiguration().textProvider,
    feature,
    model,
    durationMs,
    category: errorCategory(error),
    errorName: error instanceof Error ? error.name : "UnknownError",
    statusCode: errorStatus(error) ?? null,
  });
}

function apiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new AiProviderError("configuration_missing");
  return key;
}

async function lovableRequest(
  path: "/chat/completions" | "/images/generations" | "/audio/speech",
  body: unknown,
  timeoutMs: number,
): Promise<Response> {
  const key = apiKey();
  const response = await fetch(`${LOVABLE_AI_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new AiProviderError(categoryForStatus(response.status), response.status);
  return response;
}

function categoryForStatus(status: number): string {
  if (status === 402) return "credits_unavailable";
  if (status === 401 || status === 403) return "authentication";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "request_failed";
}

function imageDataUrl(image: unknown, mediaType?: string): string {
  if (image instanceof URL) return image.toString();
  if (typeof image === "string") {
    return image.startsWith("data:") ? image : `data:${mediaType ?? "image/png"};base64,${image}`;
  }
  if (image instanceof Uint8Array) {
    return `data:${mediaType ?? "image/png"};base64,${Buffer.from(image).toString("base64")}`;
  }
  if (image instanceof ArrayBuffer) {
    return `data:${mediaType ?? "image/png"};base64,${Buffer.from(image).toString("base64")}`;
  }
  throw new AiProviderError("invalid_response");
}

function messagesFor(options: AiRequestOptions): LovableMessage[] {
  const messages: LovableMessage[] = [];
  if (options.instructions) messages.push({ role: "system", content: options.instructions });

  if (options.messages) {
    for (const message of options.messages) {
      const role =
        message.role === "system" || message.role === "assistant" ? message.role : "user";
      if (typeof message.content === "string") {
        messages.push({ role, content: message.content });
        continue;
      }
      const content = message.content.map((part) => {
        if (part.type === "text") return { type: "text" as const, text: part.text };
        if (part.type === "image") {
          return {
            type: "image_url" as const,
            image_url: { url: imageDataUrl(part.image, part.mediaType) },
          };
        }
        throw new AiProviderError("invalid_response");
      });
      messages.push({ role, content });
    }
  } else {
    messages.push({ role: "user", content: options.prompt });
  }
  return messages;
}

async function lovableChat(options: AiRequestOptions, jsonMode = false): Promise<string> {
  const response = await lovableRequest(
    "/chat/completions",
    {
      model: options.model ?? DEFAULT_AI_TEXT_MODEL,
      messages: messagesFor(options),
      max_tokens: 8192,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    },
    options.timeoutMs ?? DEFAULT_TEXT_TIMEOUT_MS,
  );
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new AiProviderError("invalid_response");
  }
  const content = (result as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
    ?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((part) =>
              typeof part === "object" && part !== null && "text" in part ? String(part.text) : "",
            )
            .join("")
        : "";
  if (!text.trim()) throw new AiProviderError("empty_response");
  return text.trim();
}

async function sdkTextRequest<T>(
  options: AiRequestOptions,
  generate: (model: TextModel, settings: { maxRetries: number; timeout: number }) => Promise<T>,
): Promise<T> {
  const modelId = options.model ?? DEFAULT_AI_TEXT_MODEL;
  return generate(options.modelOverride ?? vercelGateway().languageModel(modelId), {
    maxRetries: options.maxRetries ?? 1,
    timeout: options.timeoutMs ?? DEFAULT_TEXT_TIMEOUT_MS,
  });
}

function promptFields(options: AiRequestOptions) {
  return {
    ...(options.instructions ? { instructions: options.instructions } : {}),
    ...(options.messages ? { messages: options.messages } : { prompt: options.prompt }),
  };
}

export async function generateAiText(options: AiRequestOptions): Promise<string> {
  const startedAt = Date.now();
  try {
    let text: string;
    if (options.modelOverride || !usesLovableGateway()) {
      const result = await sdkTextRequest(options, (model, settings) =>
        generateText({ model, ...promptFields(options), ...settings }),
      );
      text = result.text.trim();
    } else {
      text = await lovableChat(options);
    }
    if (!text) throw new AiProviderError("empty_response");
    console.info("[MealMate AI] request completed", {
      provider: getAiProviderConfiguration().textProvider,
      feature: options.feature,
      model: options.model ?? DEFAULT_AI_TEXT_MODEL,
      durationMs: Date.now() - startedAt,
    });
    return text;
  } catch (error) {
    logFailure(
      options.feature,
      options.model ?? DEFAULT_AI_TEXT_MODEL,
      error,
      Date.now() - startedAt,
    );
    throw publicError(errorCategory(error));
  }
}

function parseJsonObject(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new AiProviderError("invalid_response");
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new AiProviderError("invalid_response");
  }
}

export async function generateAiObject<TSchema extends z.ZodTypeAny>(
  options: AiRequestOptions & { schema: TSchema },
): Promise<z.output<TSchema>> {
  const startedAt = Date.now();
  try {
    let output: unknown;
    if (options.modelOverride || !usesLovableGateway()) {
      const result = await sdkTextRequest(options, (model, settings) =>
        generateText({
          model,
          ...promptFields(options),
          output: Output.object({ schema: options.schema }),
          ...settings,
        }),
      );
      output = result.output;
    } else {
      const schema = await zodSchema(options.schema).jsonSchema;
      output = parseJsonObject(
        await lovableChat(
          {
            ...options,
            instructions: `${options.instructions ?? ""}\nReturn only a JSON object matching this JSON Schema:\n${JSON.stringify(schema)}`,
          },
          true,
        ),
      );
    }
    try {
      return options.schema.parse(output) as z.output<TSchema>;
    } catch {
      throw new AiProviderError("invalid_response");
    }
  } catch (error) {
    logFailure(
      options.feature,
      options.model ?? DEFAULT_AI_TEXT_MODEL,
      error,
      Date.now() - startedAt,
    );
    throw publicError(errorCategory(error));
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
    let bytes: Uint8Array;
    let mediaType: string;
    if (usesLovableGateway()) {
      const response = await lovableRequest(
        "/images/generations",
        {
          model,
          prompt,
          size: options.size ?? "1536x1024",
          quality: "medium",
          response_format: "b64_json",
        },
        options.timeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS,
      );
      let result: { data?: { b64_json?: string; mime_type?: string; media_type?: string }[] };
      try {
        result = (await response.json()) as typeof result;
      } catch {
        throw new AiProviderError("invalid_response");
      }
      const image = result.data?.[0];
      const base64 = image?.b64_json;
      if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
        throw new AiProviderError("invalid_response");
      bytes = new Uint8Array(Buffer.from(base64, "base64"));
      mediaType = image?.mime_type ?? image?.media_type ?? "image/png";
    } else {
      const result = await generateImage({
        model: vercelGateway().imageModel(model),
        prompt,
        size: options.size ?? "1536x1024",
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS),
      });
      bytes = result.image.uint8Array;
      mediaType = result.image.mediaType;
    }
    if (bytes.byteLength === 0 || bytes.byteLength > 20 * 1024 * 1024) {
      throw new AiProviderError("invalid_response");
    }
    if (!/^image\/(png|jpeg|webp)$/i.test(mediaType)) throw new AiProviderError("invalid_response");

    console.info("[MealMate AI] image completed", {
      provider: getAiProviderConfiguration().textProvider,
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
    let bytes: Uint8Array;
    let mediaType = "audio/mpeg";
    if (usesLovableGateway()) {
      const response = await lovableRequest(
        "/audio/speech",
        {
          model,
          input: text,
          voice: options.voice ?? "alloy",
          response_format: "mp3",
          instructions: "Warm, clear, documentary narrator pace.",
        },
        options.timeoutMs ?? DEFAULT_SPEECH_TIMEOUT_MS,
      );
      bytes = new Uint8Array(await response.arrayBuffer());
    } else {
      const result = await generateSpeech({
        model: vercelGateway().speechModel(model),
        text,
        voice: options.voice ?? "alloy",
        outputFormat: "mp3",
        instructions: "Warm, clear, documentary narrator pace.",
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_SPEECH_TIMEOUT_MS),
      });
      bytes = result.audio.uint8Array;
      mediaType = result.audio.mediaType;
    }
    if (bytes.byteLength === 0 || bytes.byteLength > 20 * 1024 * 1024) {
      throw new AiProviderError("invalid_response");
    }
    console.info("[MealMate AI] speech completed", {
      provider: getAiProviderConfiguration().textProvider,
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
