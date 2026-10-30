import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, Bell, CalendarDays, Check, ShoppingBag } from "lucide-react";
import { ChefMascot } from "@/components/chef-mascot";
import { MealMateLogo } from "@/components/mealmate-logo";
import { RecipeImage } from "@/components/recipe-image";

const ONBOARDING_COPY = [
  [
    "Discover. Plan. Eat. Enjoy.",
    "Your companion for better meals, easier planning, and a little help from Mia.",
  ],
  ["Find your next favourite.", "Recipes and ideas that fit the way you actually cook."],
  ["Make every meal count.", "Plan the week and keep shopping organised in one place."],
  [
    "Meet Mia, your kitchen companion.",
    "Say “Hey Mia” for hands-free help. Mic is optional; audio stays on your device.",
  ],
  [
    "Make MealMate yours.",
    "Tell us a little about your taste. Everything is optional and easy to change later.",
  ],
  [
    "Stay in the loop.",
    "Get useful product updates on this device — only if you want them.",
  ],
  [
    "You’re ready to cook.",
    "Fresh inspiration, simpler planning, and Mia when you need her. Welcome in.",
  ],
] as const;

const EYEBROWS = [
  "Welcome",
  "Discover",
  "Plan & organise",
  "Your companion",
  "Your taste",
  "Notifications",
  "All set",
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
      <div className="onboarding-frame">
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
            ) : (
              <MealMateLogo imageClassName="size-9 rounded-xl" className="text-white" />
            )}
            <span className="onboarding-step">{String(step + 1).padStart(2, "0")} / 07</span>
          </div>
          <div
            className="onboarding-progress"
            role="progressbar"
            aria-label="Onboarding progress"
            aria-valuemin={1}
            aria-valuemax={7}
            aria-valuenow={step + 1}
          >
            {ONBOARDING_COPY.map((_, i) => (
              <span key={i} data-active={i <= step} />
            ))}
          </div>
        </header>
        <div className="onboarding-content" ref={content}>
          <section key={step} className="onboarding-scene">
            {step !== 4 && <OnboardingHero step={step} />}
            <p className="onboarding-eyebrow">{EYEBROWS[step]}</p>
            <h1 ref={heading} tabIndex={-1} className="onboarding-title">
              {copy[0]}
            </h1>
            <p className="onboarding-description">{copy[1]}</p>
            {children}
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
      <div className="onboarding-ambient" aria-hidden="true" />
      {step === 0 || step === 3 || step === 6 ? (
        <ChefMascot className="onboarding-mia" animate={step === 0 || step === 6} />
      ) : step === 1 ? (
        <div className="onboarding-food">
          <RecipeImage
            recipe={{ name: "Greek chicken salad" }}
            size="card"
            priority
            sizes="320px"
            className="h-full w-full rounded-[28px]"
          />
          <span className="onboarding-photo-caption">Fresh ideas. Real flavour.</span>
        </div>
      ) : step === 2 ? (
        <div className="onboarding-planner" aria-label="Meal planning illustration">
          <div className="onboarding-planner-heading">
            <CalendarDays size={20} />
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
            <ShoppingBag size={16} /> From meal ideas to your shopping list
          </p>
        </div>
      ) : (
        <div className="onboarding-bell" aria-hidden="true">
          <Bell size={72} strokeWidth={1.1} />
          <span>
            <Check size={16} />
          </span>
        </div>
      )}
    </div>
  );
}
