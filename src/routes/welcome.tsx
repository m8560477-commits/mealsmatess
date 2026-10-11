import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MascotMark } from "@/components/mealmate-logo";
import { markTourSeen } from "@/lib/preferences";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome to MealMate" },
      {
        name: "description",
        content: "Discover restaurants, order your food, plan your meals, and make every bite count.",
      },
      { property: "og:title", content: "Welcome to MealMate" },
      {
        property: "og:description",
        content: "Discover restaurants, order your food, plan your meals, and make every bite count.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WelcomePage,
});

const STEPS = [
  { target: "home", title: "Your MealMate home.", body: "Discover meals, restaurants, recommendations, and everything you need to make your next meal easier." },
  { target: "dining", title: "Find somewhere to eat.", body: "Discover restaurants, explore menus, and find your next meal." },
  { target: "planner", title: "Plan your meals.", body: "Organize your meals for the week and make planning what to eat simple." },
  { target: "chef", title: "Turn ingredients into meals.", body: "Explore recipes, understand ingredients, and discover new things to cook." },
  { target: "profile", title: "Make MealMate yours.", body: "Manage your preferences, account, saved content, subscription, themes, and personal MealMate experience." },
] as const;

type Phase = "welcome" | "tour" | "ready";

function haptic() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* unsupported */
  }
}

/** Renders above the app shell (header + bottom bar) instead of inside the page. */
function Overlay({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

function WelcomePage() {
  return (
    <Overlay>
      <WelcomeFlow />
    </Overlay>
  );
}

function WelcomeFlow() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("welcome");
  const [step, setStep] = useState(0);

  const finishTour = useCallback(() => {
    markTourSeen();
    setPhase("ready");
  }, []);

  const next = useCallback(() => {
    haptic();
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else finishTour();
  }, [step, finishTour]);
  const back = useCallback(() => {
    haptic();
    setStep((s) => Math.max(0, s - 1));
  }, []);

  useEffect(() => {
    if (phase !== "tour") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") back();
      if (e.key === "Escape") finishTour();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, next, back, finishTour]);

  if (phase === "welcome") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background px-6 pb-[max(env(safe-area-inset-bottom),2rem)] pt-[max(env(safe-area-inset-top),1.5rem)]">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              markTourSeen();
              setPhase("ready");
            }}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Skip
          </button>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
          <MascotMark className="size-36 rounded-[2rem] shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-700" />
          <h1 className="mt-10 font-display text-4xl leading-tight tracking-tight motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500 sm:text-5xl">
            Welcome to MealMate.
          </h1>
          <p className="mt-4 max-w-sm text-base text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700">
            Discover restaurants, order your food, plan your meals, and make every bite count.
          </p>
        </div>
        <div className="mx-auto w-full max-w-md">
          <Button
            size="lg"
            className="h-14 w-full rounded-full text-base transition-transform active:scale-[0.98]"
            onClick={() => {
              haptic();
              setPhase("tour");
            }}
          >
            Explore MealMate
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background px-6 pb-[max(env(safe-area-inset-bottom),2rem)] pt-[max(env(safe-area-inset-top),1.5rem)] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
          <MascotMark className="size-24 rounded-3xl" />
          <h1 className="mt-8 font-display text-4xl leading-tight tracking-tight">
            Ready to make every bite count?
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Create your MealMate account and personalize your experience.
          </p>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-col gap-3">
          <Button
            size="lg"
            className="h-14 rounded-full text-base active:scale-[0.98]"
            onClick={() => navigate({ to: "/auth", search: { mode: "signup" } })}
          >
            Create Account
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="h-14 rounded-full text-base"
            onClick={() => navigate({ to: "/auth", search: { mode: "signin" } })}
          >
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return <Tour step={step} onNext={next} onBack={back} onSkip={finishTour} />;
}

function useTargetRect(target: string) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(`[data-tour="${target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    const t = window.setTimeout(measure, 120);
    return () => {
      window.removeEventListener("resize", measure);
      window.clearTimeout(t);
    };
  }, [target]);
  return rect;
}

function Tour({
  step,
  onNext,
  onBack,
  onSkip,
}: {
  step: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const s = STEPS[step]!;
  const rect = useTargetRect(s.target);
  const touchX = useRef<number | null>(null);
  const pad = 6;
  const last = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="MealMate tour"
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
        touchX.current = null;
        if (dx < -50) onNext();
        else if (dx > 50 && step > 0) onBack();
      }}
    >
      {/* Spotlight: the real app UI stays visible through the cut-out. */}
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-2xl ring-2 ring-primary transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px color-mix(in oklab, var(--foreground) 62%, transparent)",
          }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-foreground/60" />
      )}

      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),1rem)]">
        <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === step ? "w-6 bg-background" : "w-1.5 bg-background/50",
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-full bg-background/90 px-3 py-1.5 text-sm font-medium text-foreground"
        >
          Skip tour
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-[calc(var(--app-nav-h,72px)+1.5rem)] px-4">
        <div
          key={step}
          className="mx-auto max-w-md rounded-3xl border border-border bg-card p-6 shadow-xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {step + 1} of {STEPS.length}
          </p>
          <h2 className="mt-2 font-display text-2xl">{s.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
          <div className="mt-6 flex items-center gap-3">
            {step > 0 && (
              <Button variant="outline" size="icon" className="h-12 w-12 rounded-full" onClick={onBack} aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Button className="h-12 flex-1 rounded-full active:scale-[0.98]" onClick={onNext}>
              {last ? "Continue" : "Next"}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
