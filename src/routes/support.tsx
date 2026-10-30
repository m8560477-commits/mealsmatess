import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Mail } from "lucide-react";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Support \u00b7 MealMate" },
      { property: "og:description", content: "Help and answers for MealMate." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Support · MealMate" },
      { name: "description", content: "Help and answers for MealMate." },
    ],
  }),
  component: SupportPage,
});

const FAQ = [
  {
    q: "How do I save a recipe?",
    a: "Open any recipe and tap the heart. Saved recipes appear in your Cookbook.",
  },
  {
    q: "How does the AI Recipe Generator work?",
    a: "Describe a dish, cuisine, or what you have on hand and MealMate builds a full recipe with ingredients, steps, and an image.",
  },
  {
    q: "How does the AI Food Scanner work?",
    a: "Open Scan, point your camera at ingredients or a fridge shelf, and MealMate suggests recipes you can make.",
  },
  {
    q: "How do referrals work?",
    a: "Share your unique link from Premium → Referrals. When a friend upgrades to paid Premium, you both earn rewards.",
  },
  {
    q: "How do promo codes work?",
    a: "Enter the code on the Premium page. Valid codes add Premium days to your account instantly.",
  },
  {
    q: "How do I upgrade to Premium?",
    a: "Visit the Premium page to see available plans and pricing. Trial eligibility and terms are confirmed at checkout.",
  },
  {
    q: "How do I cancel Premium?",
    a: "Manage your subscription in the App Store or Play Store where you purchased it. Access continues until the end of the paid period.",
  },
  {
    q: "How do I delete my account?",
    a: "Email support@mealmate.app from your account email and we'll delete your data within 7 days.",
  },
  {
    q: "Can I use MealMate offline?",
    a: "You need a connection for AI features. Saved recipes are cached and readable offline.",
  },
];

function SupportPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Link
        to="/profile"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to settings
      </Link>
      <h1 className="mt-4 font-display text-4xl">Help Center</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Answers to common questions. Still stuck? Reach out below.
      </p>

      <div className="mt-8 space-y-3">
        {FAQ.map((item) => (
          <details
            key={item.q}
            className="group rounded-2xl border border-border bg-card px-4 py-3 open:pb-4"
          >
            <summary className="cursor-pointer list-none text-sm font-medium">{item.q}</summary>
            <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>

      <a
        href="mailto:support@mealmate.app"
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        <Mail className="h-4 w-4" />
        Contact support
      </a>
    </main>
  );
}
