// Server-only AI client for MealMate.
// Uses Lovable's gateway when configured and the existing Groq key for text-only requests otherwise.

export const DEFAULT_AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
export const DEFAULT_GROQ_CHAT_MODEL = "llama-3.3-70b-versatile";
const GROQ_API_URL = "https://api.groq.com/openai/v1";

const ALLOWED_PATHS = new Set([
  "/chat/completions",
  "/images/generations",
  "/audio/speech",
  "/responses",
]);

export type LovableInit = {
  method?: string;
  headers?: Record<string, string> | Headers | unknown;
  body: string;
};

export function getAiGatewayUrl(): string {
  const custom =
    process.env["LOVABLE_AI_GATEWAY_URL"]?.trim() || process.env["AI_GATEWAY_URL"]?.trim();
  if (custom) return custom.replace(/\/+$/, "");
  return DEFAULT_AI_GATEWAY_URL;
}

export function getLovableApiKey(): string {
  const key = process.env["LOVABLE_API_KEY"]?.trim();
  if (!key) {
    throw new Error(
      `AI_CONFIG_ERROR: Missing LOVABLE_API_KEY environment variable for ${getAiGatewayUrl()}.`,
    );
  }
  return key;
}

function hasGroqTextFallback(path: string, lovableApiKey: string | undefined) {
  return !lovableApiKey && path === "/chat/completions" && !!process.env["GROQ_API_KEY"]?.trim();
}

function toGroqChatBody(body: string): string {
  let payload: { model?: string; messages?: { content?: unknown }[] };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    throw new Error("AI_REQUEST_INVALID: Chat request body must be valid JSON.");
  }

  const containsImage = payload.messages?.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some(
        (part) =>
          typeof part === "object" && part !== null && "type" in part && part.type === "image_url",
      ),
  );
  if (containsImage) {
    throw new Error(
      "AI_UNSUPPORTED_INPUT: The configured Groq fallback supports text chat only; image-based AI features need an image-capable gateway.",
    );
  }

  return JSON.stringify({ ...payload, model: DEFAULT_GROQ_CHAT_MODEL });
}

/** Central server-side fetch wrapper; credentials stay on the server. */
export async function lovableFetch(path: string, init: LovableInit): Promise<Response> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!ALLOWED_PATHS.has(normalizedPath)) {
    throw new Error(
      `AI_INVALID_PATH: Unsupported AI path "${normalizedPath}". Supported paths: ${Array.from(ALLOWED_PATHS).join(", ")}`,
    );
  }

  const lovableApiKey = process.env["LOVABLE_API_KEY"]?.trim();
  const groqApiKey = process.env["GROQ_API_KEY"]?.trim();
  const useGroq = hasGroqTextFallback(normalizedPath, lovableApiKey);
  if (!lovableApiKey && !useGroq) {
    throw new Error(
      normalizedPath === "/chat/completions"
        ? "AI_CONFIG_ERROR: Text AI requires GROQ_API_KEY or LOVABLE_API_KEY."
        : `AI_CONFIG_ERROR: ${normalizedPath} requires LOVABLE_API_KEY; the configured Groq fallback supports text chat only.`,
    );
  }

  const apiKey = useGroq ? groqApiKey : lovableApiKey;
  if (!apiKey) throw new Error("AI_CONFIG_ERROR: No AI provider credential is configured.");
  const baseUrl = useGroq ? GROQ_API_URL : getAiGatewayUrl();
  const targetUrl = `${baseUrl}${normalizedPath}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...(useGroq ? {} : { "Lovable-API-Key": apiKey }),
  };

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: init.method || "POST",
      headers,
      body: useGroq ? toGroqChatBody(init.body) : init.body,
    });
  } catch (networkError) {
    const message = networkError instanceof Error ? networkError.message : String(networkError);
    throw new Error(`AI_NETWORK_ERROR: Failed to connect to ${baseUrl}: ${message}.`);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const isHtmlError =
      response.headers.get("content-type")?.toLowerCase().includes("text/html") ||
      /^\s*(?:<!doctype\s+html|<html\b)/i.test(errorBody);
    const safeDetail = isHtmlError
      ? " The provider returned an HTML error page instead of JSON."
      : "";
    const provider = useGroq ? "Groq" : "Lovable AI";

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        useGroq
          ? `AI_AUTHENTICATION_FAILED (HTTP ${response.status}): GROQ_API_KEY was rejected by Groq.${safeDetail}`
          : `AI_AUTHENTICATION_FAILED (HTTP ${response.status}): LOVABLE_API_KEY was rejected by ${targetUrl}.${safeDetail}`,
      );
    }
    if (response.status === 402 && !useGroq) {
      throw new Error(
        `AI_PAYMENT_REQUIRED (HTTP 402): AI gateway credits depleted for LOVABLE_API_KEY.${safeDetail}`,
      );
    }
    if (response.status === 429) {
      throw new Error(
        `AI_RATE_LIMITED (HTTP 429): ${provider} rate limit exceeded. Please retry in a moment.${safeDetail}`,
      );
    }
    throw new Error(
      `AI_GATEWAY_ERROR (HTTP ${response.status}): Request to ${targetUrl} failed.${safeDetail}`,
    );
  }

  return response;
}
