import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MascotMark } from "@/components/mealmate-logo";
import { markTourSeen } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { signInWithGoogle } from "@/lib/firebase";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome to MealMate" },
      {
        name: "description",
        content: "Discover. Plan. Eat. Enjoy. Your personal companion for better meals and easier dining.",
      },
      { property: "og:title", content: "Welcome to MealMate" },
      {
        property: "og:description",
        content: "Discover. Plan. Eat. Enjoy. Your personal companion for better meals and easier dining.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WelcomePage,
});

const STEPS = [
  {
    target: "home",
    title: "Your MealMate home.",
    body: "Discover meals, restaurants, recommendations, and everything you need to make your next meal easier.",
  },
  {
    target: "dining",
    title: "Find somewhere to eat.",
    body: "Discover restaurants, explore menus, and find your next meal.",
  },
  {
    target: "planner",
    title: "Plan your meals.",
    body: "Organize your meals for the week and make planning what to eat simple.",
  },
  {
    target: "chef",
    title: "Turn ingredients into meals.",
    body: "Explore recipes, understand ingredients, and discover new things to cook.",
  },
  {
    target: "profile",
    title: "Make MealMate yours.",
    body: "Manage your preferences, account, saved content, subscription, themes, and personal MealMate experience.",
  },
] as const;

type Phase = "welcome" | "tour" | "ready";

function haptic() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* unsupported */
  }
}

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
  const [busyGoogle, setBusyGoogle] = useState(false);

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

  const handleGoogle = async () => {
    try {
      setBusyGoogle(true);
      const cred = await signInWithGoogle();
      if (!cred?.user) return;
      toast.success("Welcome to MealMate!");
      navigate({ to: "/", replace: true });
    } catch (error) {
      console.error("[Welcome] Google sign-in failed:", error);
      toast.error(
        error instanceof Error && "code" in error && error.code === "auth/popup-closed-by-user"
          ? "Google sign-in was cancelled."
          : "Google sign-in is unavailable right now. Please try email instead.",
      );
    } finally {
      setBusyGoogle(false);
    }
  };

  if (phase === "welcome") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#07070a] px-6 pb-[max(env(safe-area-inset-bottom),2rem)] pt-[max(env(safe-area-inset-top),1.5rem)] text-white">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
          <div className="mb-5 flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80">
            MealMate
          </div>
          <MascotMark className="size-28 rounded-[2rem] bg-[#1e1b2a] shadow-[0_0_40px_rgba(161,154,255,0.25)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-700" />
          <h1 className="mt-8 max-w-sm font-display text-5xl leading-none tracking-[-0.06em] text-white motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500">
            Discover. Plan. Eat. Enjoy.
          </h1>
          <p className="mt-4 max-w-sm text-base leading-6 text-white/70 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700">
            Your personal companion for better meals and easier dining.
          </p>
        </div>

        <div className="mx-auto w-full max-w-md space-y-3">
          <Button
            size="lg"
            className="h-14 w-full rounded-full bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.18)] hover:bg-white/95 active:scale-[0.99]"
            onClick={handleGoogle}
            disabled={busyGoogle}
          >
            {busyGoogle ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[#4285F4]">
                G
              </span>
            )}
            Continue with Google
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="h-14 w-full rounded-full border-white/15 bg-white/5 text-white hover:bg-white/8 active:scale-[0.99]"
            onClick={() => navigate({ to: "/auth", search: { mode: "signin" } })}
          >
            <Mail className="mr-2 h-4 w-4" />
            Continue with Email
          </Button>

          <div className="pt-2 text-center text-xs text-white/45">
            By continuing, you agree to our <a href="/legal/terms" className="underline underline-offset-2">Terms</a> and <a href="/legal/privacy" className="underline underline-offset-2">Privacy Policy</a>.
          </div>
        </div>
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <div className="theme-backdrop fixed inset-0 z-50 flex flex-col bg-background px-6 pb-[max(env(safe-area-inset-bottom),2rem)] pt-[max(env(safe-area-inset-top),1.5rem)] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
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
            Create account
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="h-14 rounded-full text-base"
            onClick={() => navigate({ to: "/auth", search: { mode: "signin" } })}
          >
            Sign in
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
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 rounded-full"
                onClick={onBack}
                aria-label="Back"
              >
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
