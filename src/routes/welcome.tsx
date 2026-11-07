import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, ScanLine, Sparkles, Utensils } from "lucide-react";
import { RecipeImage } from "@/components/recipe-image";
import { completeIntro } from "@/lib/billing.functions";
import { useSession } from "@/hooks/use-session";
import { hasSeenTour, markTourSeen } from "@/lib/preferences";

export const Route = createFileRoute("/welcome")({
  head: () => ({ meta: [{ title: "Welcome to MealMate" }] }),
  component: WelcomePage,
});

const steps = [
  {
    label: "Welcome",
    title: "Welcome to MealMate.",
    description:
      "Discover recipes, plan your meals and enjoy better dining. Your next great meal starts here.",
    dish: "Greek chicken salad",
    icon: Utensils,
    detail: "Good food. Every day.",
  },
  {
    label: "Scan",
    title: "Scan your ingredients.",
    description:
      "Point your camera at what’s in your kitchen. Find delicious recipes using the ingredients you already have.",
    dish: "Rainbow buddha bowl",
    icon: ScanLine,
    detail: "Your kitchen, full of possibilities",
  },
  {
    label: "Meet Mia",
    title: "A friendly face in your kitchen.",
    description:
      "Ask Mia to generate recipes, answer your cooking questions and guide you from the first chop to the final bite.",
    dish: "Smoky beef tacos",
    icon: Sparkles,
    detail: "Your personal AI cooking companion",
  },
  {
    label: "Made for you",
    title: "Your personal food companion.",
    description:
      "Meal plans, grocery lists, saved recipes and recommendations that make everyday cooking feel effortless.",
    dish: "Creamy chicken alfredo",
    icon: CalendarDays,
    detail: "A delicious week starts here",
  },
];

function WelcomePage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (hasSeenTour()) {
      void navigate({ to: user ? "/" : "/premium", replace: true });
      return;
    }
    try {
      const saved = Number(localStorage.getItem("mealmate.intro-step.v2"));
      if (Number.isInteger(saved) && saved >= 0 && saved < steps.length) setStep(saved);
    } catch {
      /* Storage is optional; access never depends on it. */
    }
  }, [navigate, user]);
  const current = steps[step]!;
  const Icon = current.icon;
  function finish() {
    markTourSeen();
    if (user) void completeIntro().catch(() => undefined);
    try {
      localStorage.removeItem("mealmate.intro-step.v2");
    } catch {
      /* Optional cache. */
    }
    void navigate({ to: "/premium", replace: true });
  }
  function move(next: number) {
    setStep(next);
    try {
      localStorage.setItem("mealmate.intro-step.v2", String(next));
    } catch {
      /* Optional cache. */
    }
  }
  function next() {
    if (step === steps.length - 1) finish();
    else move(step + 1);
  }
  return (
    <main className="premium-flow premium-intro">
      <header className="intro-header">
        <span>
          MealMate<span className="intro-brand-dot">.</span>
        </span>
        <button onClick={finish} className="intro-skip">
          Skip
        </button>
        <span className="intro-count">
          {step + 1} / {steps.length}
        </span>
      </header>
      <section key={step} className="intro-step">
        <div className="intro-photo">
          <RecipeImage recipe={{ name: current.dish }} size="hero" priority />
          {step === 1 && (
            <div className="scan-illustration" aria-label="Ingredient scanner illustration">
              <ScanLine size={64} />
              <span>Tomatoes · Greens · Chickpeas</span>
            </div>
          )}
          <div className="intro-photo-caption">
            <Icon size={16} aria-hidden="true" />
            <span>{current.detail}</span>
          </div>
        </div>
        <div className="intro-copy" aria-live="polite">
          <p className="premium-eyebrow">{current.label}</p>
          <h1>{current.title}</h1>
          <p className="premium-description">{current.description}</p>
        </div>
      </section>
      <footer className="intro-footer">
        <div
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={step + 1}
          className="intro-progress"
        >
          {steps.map((_, i) => (
            <span key={i} className={i <= step ? "complete" : ""} />
          ))}
        </div>
        <div className="intro-controls">
          <button
            className="premium-secondary"
            disabled={step === 0}
            onClick={() => move(step - 1)}
          >
            Back
          </button>
          <button type="button" className="premium-primary" onClick={next}>
            {step === steps.length - 1 ? "Get Started" : "Next"}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="premium-terms">
          {step === steps.length - 1
            ? "Next: pick a plan. Subscription required to use MealMate."
            : "A calmer way to decide what to cook."}
        </p>
        <p className="premium-legal">
          <Link to="/legal/terms">Terms</Link>
          <span>·</span>
          <Link to="/legal/privacy">Privacy</Link>
        </p>
      </footer>
    </main>
  );
}
