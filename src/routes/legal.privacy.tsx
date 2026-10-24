import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Privacy Policy \u00b7 MealMate" },
      { property: "og:description", content: "How MealMate handles your data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Privacy Policy · MealMate" },
      { name: "description", content: "How MealMate handles your data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Link
        to="/profile"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to settings
      </Link>
      <h1 className="mt-4 font-display text-4xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This page is maintained by the MealMate team to answer common privacy questions about the
        app.
      </p>

      <section className="prose prose-sm dark:prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed text-foreground/90">
        <div>
          <h2 className="font-display text-xl">What we collect</h2>
          <p>
            When you create an account we store your email, display name, bio, and dietary
            preferences. When you use the app we store the recipes, meal plans, grocery items,
            posts, comments, likes and follows you create.
          </p>
        </div>
        <div>
          <h2 className="font-display text-xl">How we use it</h2>
          <p>
            Your data is used to power the features you interact with, showing your saved recipes,
            your feed, and content from cooks you follow. We do not sell your data.
          </p>
        </div>
        <div>
          <h2 className="font-display text-xl">Deletion</h2>
          <p>
            You can request deletion of your account and associated data at any time by contacting
            support.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          This is a summary and not a substitute for legal review. Contact the team for full terms.
        </p>
      </section>
    </main>
  );
}
