import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Terms of Service \u00b7 MealMate" },
      { property: "og:description", content: "The rules for using MealMate." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Terms of Service · MealMate" },
      { name: "description", content: "The rules for using MealMate." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Link
        to="/profile"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to settings
      </Link>
      <h1 className="mt-4 font-display text-4xl">Terms of Service</h1>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
        <div>
          <h2 className="font-display text-xl">Using MealMate</h2>
          <p>
            By using MealMate you agree to use the app for personal cooking and meal planning. Be
            kind, follow the law, and don't submit unsafe content.
          </p>
        </div>
        <div>
          <h2 className="font-display text-xl">Your content</h2>
          <p>
            You own the recipes, notes, and photos you save. You grant MealMate a licence to store
            them so we can display them to you across your devices.
          </p>
        </div>
        <div>
          <h2 className="font-display text-xl">Accounts</h2>
          <p>Keep your login credentials safe. We may suspend accounts that violate these terms.</p>
        </div>
        <p className="text-xs text-muted-foreground">
          This is a summary and not a substitute for legal review.
        </p>
      </section>
    </main>
  );
}
