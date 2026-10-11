// Server-only Lovable AI client.
// Primary: Lovable AI Gateway called directly with LOVABLE_API_KEY.
// Secondary: the `ai-gateway` edge function on the Lovable Cloud backend, which
// has LOVABLE_API_KEY injected by Lovable. Used when the key isn't present in
// this runtime (e.g. Vercel/v0 previews) or the direct call fails transiently.

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1";
const ALLOWED_PATHS = new Set(["/chat/completions", "/images/generations", "/audio/speech"]);

type LovableInit = { method?: string; headers?: unknown; body: string };

function shouldFallback(status: number): boolean {
  return status === 401 || status === 403 || status === 404 || status >= 500;
}

async function viaGateway(path: string, body: string, key: string): Promise<Response> {
  return fetch(`${LOVABLE_GATEWAY}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body,
  });
}

async function viaBackend(path: string, body: string): Promise<Response> {
  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceKey) {
    throw new Error("AI_NOT_CONFIGURED: missing LOVABLE_API_KEY and Lovable Cloud backend credentials");
  }
  return fetch(`${url}/functions/v1/ai-gateway${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body,
  });
}

/**
 * Fetch-compatible call to Lovable AI. `path` is relative to the gateway's /v1,
 * e.g. "/chat/completions". Caller-supplied headers are ignored; auth is handled here.
 */
export async function lovableFetch(path: string, init: LovableInit): Promise<Response> {
  if (!ALLOWED_PATHS.has(path)) throw new Error(`Unsupported Lovable AI path: ${path}`);
  const key = process.env["LOVABLE_API_KEY"];

  if (key) {
    try {
      const res = await viaGateway(path, init.body, key);
      if (!shouldFallback(res.status)) return res;
      console.warn(`[Lovable AI] gateway returned ${res.status}, falling back to Lovable Cloud backend`);
    } catch (e) {
      console.warn("[Lovable AI] gateway unreachable, falling back to Lovable Cloud backend", e);
    }
  }

  return viaBackend(path, init.body);
}
