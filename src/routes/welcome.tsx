import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Carrot, Sparkles, Utensils } from "lucide-react";
import { RecipeImage } from "@/components/recipe-image";
import { completeIntro } from "@/lib/billing.functions";
import { useSession } from "@/hooks/use-session";
import { markTourSeen } from "@/lib/preferences";

export const Route = createFileRoute("/welcome")({
  head: () => ({ meta: [{ title: "Welcome to MealMate" }] }),
  component: WelcomePage,
});

const steps = [
  {
    label: "Discover",
    title: "Your next favourite meal starts here.",
    description: "Explore recipes you will actually cook — everyday favourites and something new when you want it.",
    dish: "Greek chicken salad",
    icon: Utensils,
    detail: "Fresh inspiration, every day",
  },
  {
    label: "Plan",
    title: "A delicious week, already planned.",
    description: "Meals, recipes and groceries in one place so dinner is one less thing to think about.",
    dish: "Creamy chicken alfredo",
    icon: CalendarDays,
    detail: "Make space for what matters",
  },
  {
    label: "Pantry",
    title: "Cook with what you already have.",
    description: "Turn ingredients on hand into dinner ideas and waste less of every shop.",
    dish: "Greek chicken salad",
    icon: Carrot,
    detail: "Less waste. More possibility",
  },
  {
    label: "Mia",
    title: "A little help from Mia.",
    description:
      "Say “Hey Mia” for hands-free cooking help. Microphone is optional; audio stays on your device.",
    dish: "Creamy chicken alfredo",
    icon: Sparkles,
    detail: "Good company in the kitchen",
  },
];

function WelcomePage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [step, setStep] = useState(0);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("mealmate.intro-step.v2"));
      if (Number.isInteger(saved) && saved >= 0 && saved < steps.length) setStep(saved);
    } catch {
      /* Storage is optional; access never depends on it. */
    }
  }, []);
  const current = steps[step]!;
  const Icon = current.icon;
  function next() {
    if (step === steps.length - 1) {
      markTourSeen();
      if (user) void completeIntro().catch(() => undefined);
      try {
        localStorage.removeItem("mealmate.intro-step.v2");
      } catch {
        /* optional */
      }
      void navigate({ to: "/premium", replace: true });
    } else {
      setStep(step + 1);
      try {
        localStorage.setItem("mealmate.intro-step.v2", String(step + 1));
      } catch {
        /* optional */
      }
    }
  }
  return (
    <main className="premium-flow premium-intro">
      <header className="intro-header">
        <span>
          MealMate<span className="intro-brand-dot">.</span>
        </span>
        <span className="intro-count">
          {step + 1} / {steps.length}
        </span>
      </header>
      <section key={step} className="intro-step">
        <div className="intro-photo">
          <RecipeImage recipe={{ name: current.dish }} size="hero" priority />
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
        <button type="button" className="premium-primary" onClick={next}>
          {step === steps.length - 1 ? "Choose Premium" : "Continue"}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
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
