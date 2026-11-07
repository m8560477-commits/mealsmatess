import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PreferenceChoices } from "@/components/onboarding-preferences";
import { OnboardingLayout } from "@/components/onboarding-layout";
import { useSession } from "@/hooks/use-session";
import {
  EMPTY_PREFERENCES,
  markTourSeen,
  normalizePreferences,
  writeLocalPreferences,
  type FoodPreferences,
} from "@/lib/preferences";
import { getMyPreferences, saveMyPreferences } from "@/lib/preferences.functions";
import {
  clearOnboardingDraft,
  readOnboardingDraft,
  saveOnboardingDraft,
} from "@/lib/onboarding-progress";
import { requestBrowserPushToken } from "@/lib/push-client";
import { registerMyPushToken, saveMyNotificationPreferences } from "@/lib/notifications.functions";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Your next great meal — MealMate" }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { user } = useSession();
  return user ? <PersonalOnboarding key={user.id} userId={user.id} /> : null;
}

const PREFS_STEP = 4;
const NOTIFY_STEP = 5;
const LAST_STEP = 6;

function PersonalOnboarding({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<FoodPreferences>(EMPTY_PREFERENCES);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setLoadError(false);
      const draft = readOnboardingDraft(userId);
      try {
        const remote = await getMyPreferences();
        if (!active) return;
        if (remote?.onboarding_completed) {
          void navigate({ to: "/", replace: true });
          return;
        }
        setPrefs(normalizePreferences(draft?.preferences ?? remote ?? EMPTY_PREFERENCES));
        if (typeof draft?.step === "number") setStep(draft.step);
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, navigate, retry]);

  useEffect(() => {
    if (loading || loadError) return;
    saveOnboardingDraft(userId, step, prefs);
  }, [step, prefs, loading, loadError, userId]);

  function next() {
    setStep((s) => Math.min(LAST_STEP, s + 1));
  }
  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  async function finish() {
    if (started.current) return;
    started.current = true;
    setBusy(true);
    try {
      await saveMyPreferences({ data: { ...prefs, onboarding_completed: true } });
      try {
        writeLocalPreferences({ ...prefs, onboarding_completed: true });
      } catch {
        /* local cache optional */
      }
      markTourSeen();
      clearOnboardingDraft(userId);
      await navigate({ to: "/", replace: true });
    } catch (error) {
      started.current = false;
      setBusy(false);
      toast.error(error instanceof Error ? error.message : "Could not finish setup.");
      setError("Could not save your preferences. Please try again.");
    }
  }

  async function saveAndContinue() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await saveMyPreferences({ data: { ...prefs, onboarding_completed: false } });
      next();
    } catch {
      setError("Could not save your preferences. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function enableNotifications() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (Capacitor.isNativePlatform()) {
        await saveMyNotificationPreferences({
          data: { productUpdatesEnabled: true, pushEnabled: false },
        });
      } else {
        const token = await requestBrowserPushToken();
        if (!token)
          throw new Error("Notifications were not enabled. You can try again or choose Not now.");
        await saveMyNotificationPreferences({
          data: { productUpdatesEnabled: true, pushEnabled: true },
        });
        await registerMyPushToken({ data: { token } });
      }
      next();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }
  if (loadError)
    return (
      <main className="premium-gate">
        <h1>Let’s pick up where you left off.</h1>
        <p>We couldn’t load your account preferences.</p>
        <button className="premium-primary" onClick={() => setRetry((n) => n + 1)}>
          Try again
        </button>
      </main>
    );

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <OnboardingLayout
      step={step}
      busy={busy}
      onBack={step > 0 && !busy ? back : undefined}
      actions={
        step === NOTIFY_STEP ? (
          <>
            <button
              className="onboarding-primary"
              disabled={busy}
              onClick={() => void enableNotifications()}
            >
              {Capacitor.isNativePlatform() ? "Enable product updates" : "Enable notifications"}
            </button>
            <button
              className="onboarding-secondary"
              disabled={busy}
              onClick={() => {
                setError("");
                next();
              }}
            >
              Not now
            </button>
          </>
        ) : (
          <button
            type="button"
            className="onboarding-primary"
            disabled={busy}
            onClick={() =>
              void (step === LAST_STEP
                ? finish()
                : step === PREFS_STEP
                  ? saveAndContinue()
                  : next())
            }
          >
            {busy ? <Loader2 className="animate-spin" size={18} /> : null}
            {step === LAST_STEP ? "Get started" : step === PREFS_STEP ? "Continue" : "Next"}
          </button>
        )
      }
    >
      {step === 1 && (
        <p className="onboarding-copy">Tell us how you cook so Mia can help in the kitchen.</p>
      )}
      {step === 3 && (
        <p className="onboarding-copy">We will personalise recipes around your household.</p>
      )}
      {step === PREFS_STEP && (
        <PreferenceChoices preferences={prefs} onChange={setPrefs} disabled={busy} />
      )}
      {error && <p role="alert">{error}</p>}
    </OnboardingLayout>
  );
}
