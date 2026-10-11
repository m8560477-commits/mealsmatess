import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/grocery")({
  head: () => ({ meta: [
    { title: "Grocery list | MealMate" },
    { name: "description", content: "Open your MealMate grocery list and keep shopping organised." },
    { property: "og:title", content: "Grocery list | MealMate" },
    { property: "og:description", content: "Open your MealMate grocery list and keep shopping organised." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: GroceryAlias,
});

function GroceryAlias() {
  return <Navigate to="/list" replace />;
}