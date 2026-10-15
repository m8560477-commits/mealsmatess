// Server-only AI client for MealMate.
// Operates independently of Lovable Cloud backend infrastructure.
// Communicates directly with the documented Lovable AI Gateway endpoint using LOVABLE_API_KEY.

export const DEFAULT_AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";

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

/**
 * Returns the configured gateway endpoint.
 * Defaults to the official Lovable AI Gateway (https://ai.gateway.lovable.dev/v1).
 * Can be overridden via LOVABLE_AI_GATEWAY_URL or AI_GATEWAY_URL for custom proxies or staging.
 */
export function getAiGatewayUrl(): string {
  const custom =
    process.env["LOVABLE_AI_GATEWAY_URL"]?.trim() || process.env["AI_GATEWAY_URL"]?.trim();
  if (custom) return custom.replace(/\/+$/, "");
  return DEFAULT_AI_GATEWAY_URL;
}

/**
 * Validates and retrieves the LOVABLE_API_KEY credential from environment variables.
 * Throws a descriptive configuration error if missing.
 */
export function getLovableApiKey(): string {
  const key = process.env["LOVABLE_API_KEY"]?.trim();
  if (!key) {
    throw new Error(
      `AI_CONFIG_ERROR: Missing LOVABLE_API_KEY environment variable. MealMate's AI features (Chef Chat, Recipe Generator, Meal Planner, and Recipe Importer) require a valid LOVABLE_API_KEY credential to connect directly to ${getAiGatewayUrl()}. Configure LOVABLE_API_KEY in your hosting environment (e.g. Vercel dashboard).`,
    );
  }
  return key;
}

/**
 * Central server-side fetch wrapper for all MealMate AI operations.
 * Communicates directly with the Lovable AI Gateway using the user's LOVABLE_API_KEY.
 *
 * All automatic Lovable Cloud backend edge function fallbacks have been removed so
 * the application runs independently on standard hosting platforms like Vercel.
 */
export async function lovableFetch(path: string, init: LovableInit): Promise<Response> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!ALLOWED_PATHS.has(normalizedPath)) {
    throw new Error(
      `AI_INVALID_PATH: Unsupported AI path "${normalizedPath}". Supported paths: ${Array.from(ALLOWED_PATHS).join(", ")}`,
    );
  }

  const apiKey = getLovableApiKey();
  const gatewayUrl = getAiGatewayUrl();
  const targetUrl = `${gatewayUrl}${normalizedPath}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "Lovable-API-Key": apiKey,
  };

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: init.method || "POST",
      headers,
      body: init.body,
    });
  } catch (networkError) {
    const message = networkError instanceof Error ? networkError.message : String(networkError);
    throw new Error(
      `AI_NETWORK_ERROR: Failed to connect to AI Gateway at ${targetUrl}: ${message}. Check internet connectivity and host firewall rules.`,
    );
  }

  // Handle explicit API error codes without silent fallbacks
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `AI_AUTHENTICATION_FAILED (HTTP ${response.status}): The provided LOVABLE_API_KEY was rejected by ${targetUrl}. Ensure that LOVABLE_API_KEY is an active, valid credential for the Lovable AI Gateway. Response: ${errorBody.slice(0, 300)}`,
      );
    }
    if (response.status === 402) {
      throw new Error(
        `AI_PAYMENT_REQUIRED (HTTP 402): AI gateway credits depleted for this LOVABLE_API_KEY. Response: ${errorBody.slice(0, 300)}`,
      );
    }
    if (response.status === 429) {
      throw new Error(
        `AI_RATE_LIMITED (HTTP 429): Rate limit exceeded on AI gateway at ${targetUrl}. Please retry in a moment. Response: ${errorBody.slice(0, 300)}`,
      );
    }
    throw new Error(
      `AI_GATEWAY_ERROR (HTTP ${response.status}): Request to ${targetUrl} failed. ${errorBody.slice(0, 300)}`,
    );
  }

  return response;
}
