import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, Bell, CalendarDays, Check, ShoppingBag } from "lucide-react";
import { ChefMascot } from "@/components/chef-mascot";
import { MealMateLogo } from "@/components/mealmate-logo";
import { RecipeImage } from "@/components/recipe-image";

const ONBOARDING_COPY = [
  ["Discover. Plan. Eat. Enjoy.", "Your personal companion for better meals and easier dining."],
  ["Find your next favourite.", "Discover recipes and meals that fit your taste."],
  ["Make every meal count.", "Plan your week and organise your shopping in one place."],
  ["Your food assistant, Mia.", "Get help with recipes, ingredients, meal ideas and planning."],
  [
    "Make MealMate yours.",
    "A little about your taste. Everything here is optional, and you can change it later.",
  ],
  [
    "Stay in the loop.",
    "Choose whether to receive useful MealMate product updates on this device.",
  ],
  [
    "Your next great meal starts here.",
    "Fresh inspiration. Easier planning. A little help from Mia. Welcome to your kitchen.",
  ],
] as const;

export function OnboardingLayout({
  step,
  children,
  actions,
  onBack,
  busy = false,
}: {
  step: number;
  children?: ReactNode;
  actions: ReactNode;
  onBack?: () => void;
  busy?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    content.current?.scrollTo?.(0, 0);
    document.getElementById("app-scroll")?.scrollTo?.(0, 0);
  }, [step]);
  const copy = ONBOARDING_COPY[step]!;
  return (
    <main className="onboarding-shell" aria-busy={busy}>
      <div className="onboarding-frame" data-step={step}>
        <header className="onboarding-header">
          <div className="onboarding-brand-row">
            {onBack ? (
              <button
                type="button"
                className="onboarding-back"
                onClick={onBack}
                disabled={busy}
                aria-label="Previous onboarding screen"
              >
                <ArrowLeft size={20} />
              </button>
            ) : null}
            <MealMateLogo imageClassName="size-8 rounded-lg" className="text-foreground" />
            {step > 0 && <span className="onboarding-step">{step + 1} of 7</span>}
          </div>
          {step > 0 && (
            <div
              className="onboarding-progress"
              role="progressbar"
              aria-label="Onboarding progress"
              aria-valuemin={0}
              aria-valuemax={7}
              aria-valuenow={step + 1}
            >
              {ONBOARDING_COPY.map((_, i) => (
                <span key={i} data-active={i <= step} />
              ))}
            </div>
          )}
        </header>
        <div className="onboarding-content" ref={content}>
          <section key={step} className="onboarding-scene">
            {step !== 4 && <OnboardingHero step={step} />}
            <div className="onboarding-copy">
              <p className="onboarding-eyebrow">
                {
                  [
                    "A seat at your table",
                    "Discover",
                    "Plan & organise",
                    "Meet your companion",
                    "Your taste, your way",
                    "On your terms",
                    "Made for your everyday",
                  ][step]
                }
              </p>
              <h1 ref={heading} tabIndex={-1} className="onboarding-title">
                {copy[0]}
              </h1>
              <p className="onboarding-description">{copy[1]}</p>
              {children}
            </div>
          </section>
        </div>
        <footer className="onboarding-actions">{actions}</footer>
      </div>
    </main>
  );
}

function OnboardingHero({ step }: { step: number }) {
  return (
    <div className={`onboarding-hero onboarding-hero-${step}`}>
      {step === 0 || step === 3 || step === 6 ? (
        <ChefMascot className="onboarding-mia" />
      ) : step === 1 ? (
        <div className="onboarding-food">
          <RecipeImage
            recipe={{ name: "Greek chicken salad" }}
            size="card"
            priority
            sizes="320px"
            className="h-full w-full rounded-[32px]"
          />
          <span className="onboarding-photo-caption">Fresh ideas. Real flavour.</span>
        </div>
      ) : step === 2 ? (
        <div className="onboarding-planner" aria-label="Meal planning illustration">
          <div className="onboarding-planner-heading">
            <CalendarDays size={21} />
            <span>A week of possibilities</span>
          </div>
          <div className="onboarding-week" aria-hidden="true">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i} data-selected={i === 2}>
                {d}
              </span>
            ))}
          </div>
          <div className="onboarding-plan-photo">
            <RecipeImage
              recipe={{ name: "Creamy chicken alfredo" }}
              size="card"
              priority
              sizes="280px"
              className="h-full w-full"
            />
          </div>
          <p>
            <ShoppingBag size={17} /> From meal ideas to your shopping list
          </p>
        </div>
      ) : (
        <div className="onboarding-bell" aria-hidden="true">
          <Bell size={76} strokeWidth={1} />
          <span>
            <Check size={18} />
          </span>
        </div>
      )}
    </div>
  );
}
