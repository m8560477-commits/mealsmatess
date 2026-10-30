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
    label: "A WORLD OF FLAVOUR",
    title: "Your next favourite meal starts here.",
    description: "Discover delicious recipes, from everyday favourites to something entirely new.",
    dish: "Greek chicken salad",
    icon: Utensils,
    detail: "Fresh inspiration, every day",
  },
  {
    label: "LESS PLANNING. MORE LIVING.",
    title: "A delicious week, already planned.",
    description:
      "Bring your meals, recipes and grocery list together. Make dinner one less thing to think about.",
    dish: "Creamy chicken alfredo",
    icon: CalendarDays,
    detail: "Make space for what matters",
  },
  {
    label: "A LITTLE RESOURCEFULNESS",
    title: "Great meals begin with what you have.",
    description:
      "Put your pantry to work. Find inspiration in the ingredients you already have and make more of every shop.",
    dish: "Greek chicken salad",
    icon: Carrot,
    detail: "Less waste. More possibility.",
  },
  {
    label: "MEET YOUR COOKING COMPANION",
    title: "A little help from Mia. A lot more confidence.",
    description:
      "Enable hands-free Mia to say “Hey Mia” and get cooking help. Microphone access is optional; audio stays on your device and activated question text goes to Mia.",
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
  const current = steps[step];
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
            <Icon size={18} />
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
        <button className="premium-primary" onClick={next}>
          Continue
          <ArrowRight size={19} />
        </button>
        <p className="premium-terms">
          {step === steps.length - 1
            ? "Choose your Premium plan next. Subscription required."
            : "A little inspiration for your everyday."}
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
