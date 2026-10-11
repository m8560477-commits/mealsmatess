// Lovable Cloud edge function: secondary path to Lovable AI.
// Only the app server (holding the service role key) may call it.
const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const ALLOWED_PATHS = new Set(["/chat/completions", "/images/generations", "/audio/speech"]);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!serviceKey || bearer !== serviceKey) {
    return new Response("Unauthorized", { status: 401 });
  }

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) return new Response("LOVABLE_API_KEY not configured", { status: 500 });

  const path = new URL(req.url).pathname.replace(/^.*\/ai-gateway/, "");
  if (!ALLOWED_PATHS.has(path)) return new Response("Not found", { status: 404 });

  const upstream = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
    body: await req.text(),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
});
