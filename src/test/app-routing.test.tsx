import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
const ROUTE_SMOKE_PATHS = [
  "/",
  "/about",
  "/admin",
  "/auth",
  "/auth/callback",
  "/chat",
  "/checkout",
  "/coach",
  "/cookbook",
  "/grocery",
  "/list",
  "/notifications",
  "/onboarding",
  "/order/smoke-order",
  "/orders",
  "/pantry",
  "/partner",
  "/partner/dashboard",
  "/planner",
  "/premium",
  "/profile",
  "/recipe/smoke-recipe",
  "/recipes",
  "/reset-password",
  "/restaurant/smoke-restaurant",
  "/restaurants",
  "/scan",
  "/settings",
  "/support",
  "/welcome",
  "/legal/privacy",
  "/legal/terms",
  "/api/mia",
  "/api/scan",
  "/api/recipe-image",
  "/api/public/announcements-cron",
  "/api/public/firebase-messaging-config",
  "/api/public/webhooks/revenuecat",
];

describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("matches every registered page and API route", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const unmatched = ROUTE_SMOKE_PATHS.filter(
      (path) => router.matchRoutes(path).at(-1)?.routeId === rootRouteId,
    );

    expect(unmatched).toEqual([]);
  });
});
