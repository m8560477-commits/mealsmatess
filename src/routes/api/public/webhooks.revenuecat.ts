import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/revenuecat")({
  server: { handlers: { POST: async ({ request }) => {
    const { handleRevenueCatWebhook } = await import("@/lib/revenuecat.server");
    return handleRevenueCatWebhook(request);
  } } },
});
