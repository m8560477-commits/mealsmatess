import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Crown, Loader2, Send, Sparkles, Wand2 } from "lucide-react";
import { ChefMascot } from "@/components/chef-mascot";
import { CookingInput } from "@/components/cooking-input";
import { postAuthenticatedAi } from "@/lib/ai-api";
import { generateVisualExplanation, type VisualExplanation } from "@/lib/visual.functions";
// Heavy media player (images + audio narration) — only loaded when a visual answer exists.
const VisualExplainer = lazy(() =>
  import("@/components/visual-explainer").then((m) => ({ default: m.VisualExplainer })),
);
import { usePremium } from "@/hooks/use-premium";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search["q"] === "string" ? { q: search["q"].slice(0, 200) } : {},
  head: () => ({
    meta: [
      { title: "AI Food Chat & Visual Mode — MealMate" },
      {
        name: "description",
        content:
          "Ask MealMate anything about food and get an AI answer plus a narrated, animated visual explanation you can download.",
      },
      { property: "og:title", content: "AI Food Chat & Visual Mode — MealMate" },
      {
        property: "og:description",
        content: "AI answers with animated, narrated visual explanations for Premium members.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const SUGGESTIONS = [
  "What can I cook with chicken and rice?",
  "What can I substitute for buttermilk?",
  "Give me a quick vegetarian dinner idea",
  "What pairs well with bunny chow?",
];

type Turn = {
  question: string;
  answer: string;
  visual?: VisualExplanation;
  error?: string;
  visualLoading?: boolean;
  visualError?: string;
};

function ChatPage() {
  const { isPremium } = usePremium();
  const { q } = Route.useSearch();
  const [question, setQuestion] = useState(q ?? "");
  const endRef = useRef<HTMLDivElement>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [visualMode, setVisualMode] = useState(false);
  useEffect(() => {
    if (turns.length) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns, busy]);

  function patch(i: number, next: Partial<Turn>) {
    setTurns((t) => t.map((turn, idx) => (idx === i ? { ...turn, ...next } : turn)));
  }

  async function getAnswer(text: string, previousTurns: Turn[]) {
    const messages = previousTurns
      .filter((turn) => turn.answer.trim() && !turn.error)
      .slice(-10)
      .flatMap((turn) => [
        { role: "user" as const, content: turn.question.slice(0, 4_000) },
        { role: "assistant" as const, content: turn.answer.slice(0, 4_000) },
      ]);
    messages.push({ role: "user", content: text });
    while (
      messages.length > 1 &&
      messages.reduce((total, item) => total + item.content.length, 0) > 16_000
    ) {
      messages.splice(0, 2);
    }
    const { reply } = await postAuthenticatedAi<{ reply: string }>("/api/mia", { messages });
    if (!reply?.trim()) throw new Error("Mia returned an empty response. Please try again.");
    return reply;
  }

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setQuestion("");
    const wantsVisual = isPremium && visualMode;
    const index = turns.length;
    setTurns((t) => [...t, { question: text, answer: "", visualLoading: wantsVisual }]);

    const visualPromise = wantsVisual
      ? generateVisualExplanation({ data: { prompt: text, scenes: 4, narration: true } })
          .then((visual) => patch(index, { visual, visualLoading: false }))
          .catch((err: unknown) =>
            patch(index, {
              visualLoading: false,
              visualError: err instanceof Error ? err.message : "Visual generation failed",
            }),
          )
      : Promise.resolve();

    try {
      patch(index, { answer: await getAnswer(text, turns) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mia is unavailable. Please try again.";
      patch(index, { answer: "", error: message });
      toast.error("Couldn't answer that", { description: message });
    } finally {
      setBusy(false);
      void visualPromise;
    }
  }

  async function retryAnswer(index: number) {
    const turn = turns[index];
    if (!turn || busy) return;
    setBusy(true);
    patch(index, { answer: "", error: undefined });
    try {
      patch(index, { answer: await getAnswer(turn.question, turns.slice(0, index)) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mia is unavailable. Please try again.";
      patch(index, { error: message });
      toast.error("Couldn't answer that", { description: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10">
      {turns.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <ChefMascot animate className="h-48 w-48" />
          <h1 className="mt-6 font-display text-3xl">Your little kitchen companion.</h1>
          <p className="mt-3 text-sm text-muted-foreground">What's cooking, Chef?</p>
        </div>
      ) : (
        <h1 className="font-display text-2xl">MealMate Chef</h1>
      )}

      <div className="mt-4 flex justify-center">
        {isPremium ? (
          <Button
            variant="outline"
            className="rounded-full"
            aria-pressed={visualMode}
            onClick={() => setVisualMode((v) => !v)}
          >
            <Wand2 /> Visual Mode {visualMode ? "on" : "off"}
          </Button>
        ) : (
          <Button asChild variant="ghost" className="rounded-full text-muted-foreground">
            <Link to="/premium">
              <Crown /> Premium Visual Mode
            </Link>
          </Button>
        )}
      </div>

      <div className="mt-8 flex-1 space-y-6">
        {turns.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Button
                variant="outline"
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="rounded-full border border-border bg-card px-4 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                {s}
              </Button>
            ))}
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className="space-y-3">
            <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
              {t.question}
            </p>
            {t.answer && (
              <p className="mr-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-card px-4 py-2.5 text-sm">
                {t.answer}
              </p>
            )}
            {t.error && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-3 text-sm text-destructive"
              >
                <p>{t.error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void retryAnswer(i)}
                  disabled={busy}
                >
                  Try again
                </Button>
              </div>
            )}
            {t.visualLoading && (
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Directing your animated explainer — illustrations + narration…
              </div>
            )}
            {t.visualError && (
              <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-xs text-muted-foreground">
                Visual explanation unavailable: {t.visualError}
              </p>
            )}
            {t.visual && (
              <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-muted" />}>
                <VisualExplainer data={t.visual} />
              </Suspense>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Thinking…
          </div>
        )}
      </div>

      <div ref={endRef} />
      <div className="chat-composer sticky bottom-3 mt-6 bg-background pb-2 pt-2">
        <CookingInput
          value={question}
          onChange={setQuestion}
          onSubmit={() => {
            void ask(question);
          }}
          busy={busy}
        />
      </div>
      <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3" /> AI answers can be wrong — use judgment for allergies and
        safety.
      </p>
    </main>
  );
}
