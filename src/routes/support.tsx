import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Mail, MessageCircle, ArrowUpRight } from "lucide-react";
import { KaiSupport } from "@/components/kai-support";
import {
  CONTACT_EMAIL,
  CONTACT_EMAIL_URL,
  HELP_TOPICS,
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_URL,
} from "@/lib/support";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support · MealMate" },
      {
        name: "description",
        content: "Ask Kai, your automated MealMate support assistant, or email our team.",
      },
      { property: "og:title", content: "Support · MealMate" },
      { property: "og:description", content: "Get answers from Kai or contact MealMate support." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:py-10">
      <Link
        to="/profile"
        className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to settings
      </Link>
      <h1 className="mt-4 font-display text-4xl">How can we help?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask Kai for a quick answer, or get in touch with the MealMate team.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => document.getElementById("kai-question")?.focus()}
          className="flex items-center gap-4 rounded-2xl border border-primary/30 bg-primary/10 p-5 text-left transition-colors hover:bg-primary/15"
        >
          <MessageCircle className="size-6 shrink-0 text-primary" aria-hidden="true" />
          <span className="flex-1">
            <span className="block font-semibold">Talk to Kai</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Instant, automated answers about the app
            </span>
          </span>
          <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
        </button>
        <a
          href={SUPPORT_EMAIL_URL}
          className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted"
        >
          <Mail className="size-6 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Email support</span>
            <span className="mt-1 block break-all text-xs text-muted-foreground">
              {SUPPORT_EMAIL}
            </span>
          </span>
          <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
        </a>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        General enquiries:{" "}
        <a href={CONTACT_EMAIL_URL} className="break-all underline underline-offset-4">
          {CONTACT_EMAIL}
        </a>
      </p>
      <KaiSupport />
      <section className="mt-8" aria-labelledby="help-topics-heading">
        <h2 id="help-topics-heading" className="font-display text-2xl">
          Browse help topics
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Prefer to read? Find the same answers here.
        </p>
        <div className="mt-4 space-y-3">
          {HELP_TOPICS.map((topic) => (
            <details
              key={topic.id}
              className="rounded-2xl border border-border bg-card px-4 py-3 open:pb-4"
            >
              <summary className="cursor-pointer text-sm font-medium">{topic.question}</summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{topic.answer}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {topic.links.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="text-sm font-medium underline underline-offset-4"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>
      <p className="mt-6 text-xs text-muted-foreground">
        Email links open your email app. Your message is sent only when you send the draft.
      </p>
    </main>
  );
}
