import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { property: "og:title", content: "About \u00b7 MealMate" },
      { property: "og:description", content: "About MealMate." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "About · MealMate" },
      { name: "description", content: "About MealMate." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Link to="/profile" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Back to settings
      </Link>
      <h1 className="mt-4 font-display text-4xl">About MealMate</h1>
      <p className="mt-3 text-sm leading-relaxed text-foreground/90">
        MealMate is your kitchen companion — recipes, meal planning, and grocery lists,
        powered by an AI assistant that helps you decide what to cook next.
      </p>

      <dl className="mt-8 divide-y divide-border rounded-2xl border border-border bg-card text-sm">
        <div className="flex justify-between px-4 py-3">
          <dt className="text-muted-foreground">Version</dt>
          <dd className="font-medium">1.0.0</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-muted-foreground">Made with</dt>
          <dd className="font-medium">MealMate</dd>
        </div>
      </dl>
    </main>
  );
}
