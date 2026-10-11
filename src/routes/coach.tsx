import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Loader2, Send, Sparkles, HeartPulse, ChevronRight } from "lucide-react";
import { nutritionCoach, getCoachContext } from "@/lib/coach.functions";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/coach")({
  head: () => ({
    meta: [
      { title: "AI Nutrition Coach — MealMate" },
      {
        name: "description",
        content:
          "A personalized AI nutrition coach that reads your goals, allergies, and constraints to give practical daily food advice.",
      },
      { property: "og:title", content: "AI Nutrition Coach — MealMate" },
      {
        property: "og:description",
        content: "Personalized food and nutrition guidance tuned to your profile.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CoachPage,
});

type Turn = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "What should I eat today to hit my goal?",
  "Plan a high-protein breakfast under 400 calories.",
  "I'm short on time tonight — quick dinner ideas?",
  "How many calories should I actually eat?",
];

function CoachPage() {
  const { user, loading } = useSession();
  const { data: ctx, isLoading: ctxLoading } = useQuery({
    queryKey: ["coach-context"],
    queryFn: () => getCoachContext(),
    enabled: !!user,
  });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setInput("");
    setBusy(true);
    try {
      const { answer } = await nutritionCoach({ data: { messages: next } });
      setTurns((t) => [...t, { role: "assistant", content: answer }]);
    } catch (err) {
      toast.error("Coach is unavailable", {
        description: err instanceof Error ? err.message : undefined,
      });
      setTurns(next);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-3 h-4 w-72" />
        <Skeleton className="mt-8 h-24 w-full rounded-2xl" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <HeartPulse className="h-6 w-6" />
        </span>
        <h1 className="mt-4 font-display text-3xl">AI Nutrition Coach</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Sign in so your coach can personalize advice to your goals, allergies, and daily budget.
        </p>
        <Link
          to="/auth"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Sign in
        </Link>
      </main>
    );
  }

  const missing = ctx?.missing ?? [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <HeartPulse className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-3xl leading-tight">Nutrition Coach</h1>
          <p className="text-sm text-muted-foreground">
            Personalized advice for your goals, allergies, and daily budget.
          </p>
        </div>
      </header>

      {/* Profile summary / missing chips */}
      {ctxLoading ? (
        <Skeleton className="mt-6 h-16 w-full rounded-2xl" />
      ) : ctx ? (
        <section className="mt-6 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap gap-1.5">
            {ctx.profile?.goal && <Chip label={`Goal · ${ctx.profile.goal}`} />}
            {ctx.profile?.activity_level && (
              <Chip label={`Activity · ${ctx.profile.activity_level}`} />
            )}
            {ctx.profile?.dietary_preferences?.slice(0, 3).map((d) => (
              <Chip key={d} label={d} />
            ))}
            {ctx.profile?.allergies?.slice(0, 3).map((a) => (
              <Chip key={a} label={`No ${a}`} tone="warn" />
            ))}
            {ctx.profile?.budget_per_day && (
              <Chip
                label={`Budget · ${ctx.profile.budget_per_day} ${ctx.profile.currency ?? "USD"}/day`}
              />
            )}
          </div>
          {missing.length > 0 && (
            <Link
              to="/profile"
              className="mt-3 flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <span>
                Add your {missing.slice(0, 3).join(", ")} for sharper advice.
              </span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </section>
      ) : null}

      {/* Conversation */}
      <section className="mt-6 flex-1 space-y-4">
        {turns.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-5">
            <p className="text-sm font-medium">Try asking:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="md3-surface rounded-full border border-border bg-card px-3.5 py-2 text-left text-xs font-medium"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="rise-in max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                {t.content}
              </p>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="rise-in max-w-[92%] space-y-2 rounded-2xl rounded-bl-sm bg-card px-4 py-3 text-sm leading-relaxed [&_h3]:font-display [&_h3]:text-base [&_h3]:mt-2 [&_li]:ml-4 [&_li]:list-disc [&_strong]:font-semibold [&_a]:underline">
                <ReactMarkdown>{t.content}</ReactMarkdown>
              </div>
            </div>
          ),
        )}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" />
            Coach is thinking…
          </div>
        )}
        <div ref={endRef} />
      </section>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="sticky bottom-24 mt-6 flex gap-2 rounded-full border border-border bg-card p-1.5 shadow-sm"
      >
        <label htmlFor="coach-input" className="sr-only">
          Ask your nutrition coach
        </label>
        <Input
          id="coach-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about calories, meals, cravings…"
          className="h-11 flex-1 rounded-full border-none bg-transparent shadow-none focus-visible:ring-0"
          disabled={busy}
        />
        <Button
          type="submit"
          size="icon"
          disabled={busy || !input.trim()}
          className="h-11 w-11 rounded-full"
          aria-label="Send message"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
      <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3" /> Educational guidance, not medical advice.
      </p>
    </main>
  );
}

function Chip({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "warn" }) {
  return (
    <span
      className={
        tone === "warn"
          ? "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
          : "inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
      }
    >
      {label}
    </span>
  );
}
