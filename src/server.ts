import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const path = new URL(request.url).pathname;
      if (path.startsWith("/api/auth/")) {
        const { getAuth } = await import("./lib/auth.server");
        return getAuth().handler(request);
      }
      if (path === "/api/public/webhooks/revenuecat") {
        const { handleRevenueCatWebhook } = await import("./lib/revenuecat.server");
        return handleRevenueCatWebhook(request);
      }
      if (path.startsWith("/api/data/") || path.startsWith("/api/media/") || path.startsWith("/api/subscriptions/")) {
        if (!["GET", "HEAD"].includes(request.method) && request.headers.get("origin") !== new URL(request.url).origin) {
          return new Response("Invalid request origin", { status: 403 });
        }
        const { getAuth } = await import("./lib/auth.server");
        const session = await getAuth().api.getSession({ headers: request.headers });
        const principal = session ? { userId: session.user.id } : {};
        if (path.startsWith("/api/data/")) {
          const { handleDataRequest } = await import("./lib/database-api.server");
          return handleDataRequest(request, principal);
        }
        if (path.startsWith("/api/media/")) {
          const { handleMediaRequest } = await import("./lib/media.server");
          return handleMediaRequest(request, principal);
        }
        if (!session) return new Response("Sign in required", { status: 401 });
        const { revenueCatConfiguration, verifyRevenueCatEntitlement } = await import("./lib/revenuecat.server");
        try {
          if (path === "/api/subscriptions/config" && request.method === "GET") return Response.json({ ...revenueCatConfiguration(new URL(request.url).searchParams.get("platform") ?? "web"), userId: session.user.id }, { headers: { "Cache-Control": "no-store" } });
          if (path === "/api/subscriptions/verify" && request.method === "POST") return Response.json(await verifyRevenueCatEntitlement(session.user.id), { headers: { "Cache-Control": "no-store" } });
          return new Response("Not found", { status: 404 });
        } catch {
          return Response.json({ message: "RevenueCat configuration or verification is unavailable" }, { status: 503 });
        }
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
