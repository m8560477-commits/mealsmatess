import { createFileRoute } from "@tanstack/react-router";
import { HubHome } from "@/components/hub/hub-home";

export const Route = createFileRoute("/hub")({
  head: () => ({ meta: [{ title: "MealMate Hub | Your restaurant workspace" }] }),
  component: HubHome,
});
