import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Add hardening headers (HSTS, XFO, XCTO, Referrer-Policy, Permissions-Policy, CSP)
// to every server response. CSP is intentionally permissive for third-party image hosts
// (Lovable recipe assets, Supabase Storage, Unsplash) and the AI gateway.
const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  // `next()` may return a Response OR a framework result object (e.g. { response, context }).
  // Only attach headers when we actually have a Response — never wrap the framework result,
  // which would stringify to "[object Object]".
  const res =
    result instanceof Response
      ? result
      : result && typeof result === "object" && (result as { response?: unknown }).response instanceof Response
        ? ((result as { response: Response }).response)
        : null;
  if (res) {
    const h = res.headers;
    h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    h.set("X-Frame-Options", "SAMEORIGIN");
    h.set("X-Content-Type-Options", "nosniff");
    h.set("Referrer-Policy", "strict-origin-when-cross-origin");
    h.set(
      "Permissions-Policy",
      "camera=(self), microphone=(), geolocation=(), payment=(self)",
    );
    h.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob: https:",
        "connect-src 'self' https: wss:",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    );
  }
  return result;
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, securityHeadersMiddleware],
}));

