// Daily maintenance job. Called by Vercel Cron / Netlify Scheduled Functions
// with "Authorization: Bearer <CRON_SECRET>". Rejects every other caller.
import { createFileRoute } from "@tanstack/react-router";

async function authorized(request: Request): Promise<boolean> {
  const secret = process.env["CRON_SECRET"];
  if (!secret || secret.length < 32) return false;
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(token)),
    crypto.subtle.digest("SHA-256", enc.encode(secret)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function run(request: Request): Promise<Response> {
  if (!(await authorized(request))) return new Response("Unauthorized", { status: 401 });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Release recipe-photo claims that got stuck (no photo after 1 hour) so the next search retries.
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { error, count } = await supabaseAdmin
    .from("recipes")
    .update({ image_checked_at: null }, { count: "exact" })
    .is("image_url", null)
    .lt("image_checked_at", cutoff);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, releasedImageClaims: count ?? 0, ranAt: new Date().toISOString() });
}

export const Route = createFileRoute("/api/public/cron/daily")({
  server: { handlers: { GET: ({ request }) => run(request), POST: ({ request }) => run(request) } },
});
