import { FollowMealMate } from "@/components/follow-mealmate";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowLeft,
  ChefHat,
  Search,
  Sparkles,
  CalendarDays,
  Heart,
} from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { getWelcomeGuideCompletion, completeWelcomeGuide } from "@/lib/billing.functions";
import { RecipeImage } from "@/components/recipe-image";

const steps = [
  {
    title: "Welcome to your kitchen.",
    text: "Your MealMate membership is ready. Let’s make everyday cooking something to look forward to.",
    icon: ChefHat,
    dish: "Greek chicken salad",
  },
  {
    title: "Start with a little inspiration.",
    text: "Search recipes from Home, or open AI Chef to scan the ingredients you already have.",
    icon: Search,
    dish: "Rainbow buddha bowl",
  },
  {
    title: "Meet Mia, your cooking companion.",
    text: "Discover something delicious or ask Mia to create a recipe around your tastes and ingredients.",
    icon: Sparkles,
    dish: "Smoky beef tacos",
  },
  {
    title: "Make room for a delicious week.",
    text: "Open Planner to build a personalised meal plan and keep your week organised.",
    icon: CalendarDays,
    dish: "Creamy chicken alfredo",
  },
  {
    title: "Keep the good ones close.",
    text: "Tap a heart to save a favourite. Turn your plans into a grocery list, ready when you shop.",
    icon: Heart,
    dish: "Fluffy buttermilk pancakes",
  },
];
export function WelcomeGuide({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const client = useQueryClient();
  const key = ["welcome-guide", user?.id];
  const completion = useQuery({
    queryKey: key,
    queryFn: () => getWelcomeGuideCompletion(),
    retry: false,
  });
  const [created, setCreated] = useState(() => {
    try {
      return sessionStorage.getItem(`mealmate.account-created:${user?.id}`) === "1";
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function finish() {
    setBusy(true);
    setError("");
    try {
      await completeWelcomeGuide();
      client.setQueryData(key, true);
    } catch {
      setError("We couldn’t save your guide progress. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  if (completion.data) return <FollowMealMate>{children}</FollowMealMate>;
  if (completion.isPending)
    return (
      <main className="premium-gate" role="status">
        Getting your kitchen ready…
      </main>
    );
  if (completion.isError)
    return (
      <main className="premium-gate">
        <h1>Let’s get you settled.</h1>
        <p>We couldn’t load your welcome guide.</p>
        <button className="premium-primary" onClick={() => void completion.refetch()}>
          Try again
        </button>
      </main>
    );
  if (created)
    return (
      <main className="social-intro">
        <p className="premium-eyebrow">WELCOME TO MEALMATE</p>
        <h1>Your account is ready.</h1>
        <p>You’re all set. Let’s introduce you to your personal cooking companion.</p>
        <button
          className="premium-primary"
          onClick={() => {
            try {
              sessionStorage.removeItem(`mealmate.account-created:${user?.id}`);
            } catch {
              /* Optional hint. */
            }
            setCreated(false);
          }}
        >
          Continue to welcome guide
        </button>
      </main>
    );
  const current = steps[step];
  const Icon = current.icon;
  return (
    <main className="welcome-guide">
      <div className="guide-photo">
        <RecipeImage
          recipe={{ name: current.dish }}
          size="hero"
          sizes="(max-width: 500px) calc(100vw - 56px), 444px"
          priority
        />
      </div>
      <section className="guide-copy" aria-labelledby="guide-title">
        <p className="premium-eyebrow">YOUR MEALMATE · {step + 1} OF 5</p>
        <Icon className="guide-icon" aria-hidden="true" />
        <div key={step} aria-live="polite">
          <h1 id="guide-title">{current.title}</h1>
          <p>{current.text}</p>
        </div>
        <div
          className="guide-progress"
          role="progressbar"
          aria-label="Welcome guide"
          aria-valuemin={1}
          aria-valuemax={5}
          aria-valuenow={step + 1}
        >
          {steps.map((_, i) => (
            <span key={i} data-active={i <= step} />
          ))}
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="guide-actions">
          <button
            className="premium-secondary"
            disabled={step === 0 || busy}
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <button
            className="premium-primary"
            disabled={busy}
            onClick={() => (step === 4 ? void finish() : setStep(step + 1))}
          >
            {busy ? "Saving…" : step === 4 ? "Let’s cook" : "Next"}
            <ArrowRight size={16} />
          </button>
        </div>
        <button className="guide-skip" disabled={busy} onClick={() => void finish()}>
          Skip guide
        </button>
      </section>
    </main>
  );
}
