import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [
    { title: "Settings | MealMate" },
    { name: "description", content: "Manage your MealMate profile and preferences." },
    { property: "og:title", content: "Settings | MealMate" },
    { property: "og:description", content: "Manage your MealMate profile and preferences." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SettingsAlias,
});

function SettingsAlias() {
  return <Navigate to="/profile" replace />;
}