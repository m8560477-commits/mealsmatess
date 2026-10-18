import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

function authorized(request: Request, secret: string) {
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.replace(/^Bearer\s+/i, "");
  const actual = Buffer.from(provided);
  const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const Route = createFileRoute("/api/public/announcements-cron")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        if (!secret) return new Response("Scheduler is not configured.", { status: 503 });
        if (!authorized(request, secret)) return new Response("Unauthorized", { status: 401 });
        try {
          const { processDueAnnouncements } = await import("@/server/notification-delivery");
          const result = await processDueAnnouncements();
          return Response.json(result, { headers: { "Cache-Control": "no-store" } });
        } catch {
          return new Response("Scheduled announcement processing failed.", { status: 500 });
        }
      },
    },
  },
});
