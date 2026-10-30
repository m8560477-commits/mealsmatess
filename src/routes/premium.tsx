import { createFileRoute } from "@tanstack/react-router";
import { PremiumPaywall } from "@/components/premium-paywall";
export const Route = createFileRoute("/premium")({
  head: () => ({ meta: [{ title: "MealMate Premium" }] }),
  component: PremiumPaywall,
});
