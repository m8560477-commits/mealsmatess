// Server-only security helpers. Import inside handlers only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Enforce a per-minute rate limit for a (bucket, identifier) pair.
 * Throws Response(429) when the caller is over budget.
 * Fails open (allows the request) if the RPC itself errors so a DB blip
 * cannot lock users out.
 */
export async function enforceRateLimit(
  bucket: string,
  identifier: string,
  maxPerMinute: number,
): Promise<void> {
  if (!identifier) return;
  const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
    _bucket: bucket,
    _identifier: identifier,
    _max_per_minute: maxPerMinute,
  });
  if (error) {
    console.warn("rate_limit_error", bucket, error.message);
    return;
  }
  if (data === false) {
    throw new Response("Too many requests. Please slow down.", { status: 429 });
  }
}

export async function auditLog(entry: {
  actor_id: string | null;
  action: string;
  target_table?: string | null;
  target_id?: string | null;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    actor_id: entry.actor_id,
    action: entry.action,
    target_table: entry.target_table ?? null,
    target_id: entry.target_id ?? null,
    metadata: (entry.metadata ?? {}) as never,
    ip_address: entry.ip_address ?? null,
    user_agent: entry.user_agent ?? null,
  });
  if (error) console.warn("audit_log_error", entry.action, error.message);
}

export function clientIpFromRequest(req: Request | undefined): string | null {
  if (!req) return null;
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

/**
 * Fire-and-forget telemetry write. Never throws; errors are logged.
 * Use `trackEvent` inline, or `withTelemetry` to auto-time a handler.
 */
export async function trackEvent(evt: {
  user_id: string | null;
  kind: string;
  name: string;
  latency_ms?: number | null;
  success?: boolean;
  error?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("telemetry_events").insert({
      user_id: evt.user_id,
      kind: evt.kind,
      name: evt.name,
      latency_ms: evt.latency_ms ?? null,
      success: evt.success ?? true,
      error: evt.error ?? null,
      metadata: (evt.metadata ?? {}) as never,
    });
    if (error) console.warn("telemetry_error", evt.name, error.message);
  } catch (e) {
    console.warn("telemetry_exception", evt.name, e);
  }
}

/**
 * Wrap an async op with automatic latency + success/failure telemetry.
 * Rethrows the original error after recording.
 */
export async function withTelemetry<T>(
  meta: { user_id: string | null; kind: string; name: string; metadata?: Record<string, unknown> },
  op: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await op();
    void trackEvent({
      ...meta,
      latency_ms: Date.now() - t0,
      success: true,
    });
    return result;
  } catch (e) {
    void trackEvent({
      ...meta,
      latency_ms: Date.now() - t0,
      success: false,
      error: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500),
    });
    throw e;
  }
}
