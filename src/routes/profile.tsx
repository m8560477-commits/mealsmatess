import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/settings-page";
export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Settings \u2014 MealMate" },
      {
        property: "og:description",
        content: "Manage your MealMate account, currency, language, notifications, and privacy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Profile — MealMate" },
      {
        name: "description",
        content: "Manage your MealMate account, currency, language, notifications, and privacy.",
      },
    ],
  }),
  component: SettingsPage,
});
