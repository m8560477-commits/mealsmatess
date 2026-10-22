import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import {
  revenueCatEventSchema,
  processRevenueCatEvent,
  SUPPORTED_BILLING_EVENTS,
} from "@/server/revenuecat-webhook";
export const Route = createFileRoute("/api/public/webhooks/revenuecat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
        if (!secret) return new Response("Not configured", { status: 503 });
        const supplied = Buffer.from(
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""),
        );
        const expected = Buffer.from(secret);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
          return new Response("Unauthorized", { status: 401 });
        let event;
        try {
          const text = await request.text();
          if (text.length > 64_000) return new Response("Payload too large", { status: 413 });
          const payload = JSON.parse(text)?.event;
          if (typeof payload?.type === "string" && !SUPPORTED_BILLING_EVENTS.has(payload.type))
            return new Response("Ignored unsupported event");
          event = revenueCatEventSchema.parse(payload);
        } catch {
          return new Response("Invalid billing event", { status: 400 });
        }
        try {
          return new Response(await processRevenueCatEvent(event));
        } catch {
          return new Response("Billing verification could not complete. Retry required.", {
            status: 503,
          });
        }
      },
    },
  },
});
