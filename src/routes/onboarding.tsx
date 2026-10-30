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

/** Seven screens (0–6) matching OnboardingLayout copy and progress. */
const LAST_STEP = 6;
const PREFS_STEP = 4;
const NOTIFY_STEP = 5;

function PersonalOnboarding({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<FoodPreferences>(EMPTY_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [pushSupported, setPushSupported] = useState(false);
  useEffect(() => {
    setPushSupported(
      !Capacitor.isNativePlatform() &&
        window.isSecureContext &&
        "Notification" in window &&
        "serviceWorker" in navigator &&
        Boolean(import.meta.env.VITE_FIREBASE_VAPID_KEY),
    );
  }, []);
  useEffect(() => {
    let active = true;
    setError(null);
    void getMyPreferences()
      .then((remote) => {
        if (!active) return;
        if (remote?.onboarding_completed) {
          void navigate({ to: "/", replace: true });
          return;
        }
        const draft = readOnboardingDraft(userId);
        setPrefs(draft?.preferences ?? remote ?? EMPTY_PREFERENCES);
        setStep(draft?.step ?? 0);
        setReady(true);
      })
      .catch(() => {
        if (active)
          setError("Your preferences couldn’t load. Please check your connection and try again.");
      });
    return () => {
      active = false;
    };
  }, [userId, navigate, retry]);
  useEffect(() => {
    if (ready) saveOnboardingDraft(userId, step, prefs);
  }, [userId, step, prefs, ready]);

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function next() {
    await run(async () => {
      if (step === PREFS_STEP) {
        const { updated_at: _timestamp, ...data } = prefs;
        await saveMyPreferences({ data: { ...data, onboarding_completed: false } });
      }
      setStep(Math.min(LAST_STEP, step + 1));
    });
  }
  async function finish() {
    await run(async () => {
      const { updated_at: _timestamp, ...data } = prefs;
      await saveMyPreferences({ data: { ...data, onboarding_completed: true } });
      // Account persistence is authoritative; restricted local storage must not block completion.
      try {
        writeLocalPreferences({ ...prefs, onboarding_completed: true });
      } catch {
        /* Account is saved. */
      }
      markTourSeen();
      clearOnboardingDraft(userId);
      await navigate({ to: "/", replace: true });
    });
  }
  async function notifications() {
    await run(async () => {
      const token = await requestBrowserPushToken();
      await saveMyNotificationPreferences({
        data: { productUpdatesEnabled: true, pushEnabled: true },
      });
      await registerMyPushToken({ data: { token } });
      toast.success("Notifications enabled on this device.");
      setStep(LAST_STEP);
    });
  }
  if (!ready)
    return (
      <div className="onboarding-shell flex items-center justify-center p-8">
        <div role="status">
          {error ? (
            <>
              <p>{error}</p>
              <button className="onboarding-primary mt-6" onClick={() => setRetry((v) => v + 1)}>
                Try again
              </button>
            </>
          ) : (
            <>
              <Loader2 className="mx-auto animate-spin" />
              <p className="mt-4">Preparing your MealMate experience…</p>
            </>
          )}
        </div>
      </div>
    );
  return (
    <OnboardingLayout
      step={step}
      busy={busy}
      onBack={
        step > 0
          ? () => {
              setError(null);
              setStep(step - 1);
            }
          : undefined
      }
      actions={
        <>
          {error && (
            <p role="alert" className="onboarding-error">
              {error}
            </p>
          )}
          {step === NOTIFY_STEP ? (
            <>
              <button
                className="onboarding-primary"
                onClick={() => void notifications()}
                disabled={busy || !pushSupported}
              >
                {busy && <Loader2 size={19} className="animate-spin" />}Enable notifications
              </button>
              <button
                className="onboarding-text-button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setStep(LAST_STEP);
                }}
              >
                Not now
              </button>
            </>
          ) : (
            <button
              className="onboarding-primary"
              disabled={busy}
              onClick={() => void (step === LAST_STEP ? finish() : next())}
            >
              {busy && <Loader2 size={19} className="animate-spin" />}
              {step === LAST_STEP ? "Get started" : step === PREFS_STEP ? "Continue" : "Next"}
            </button>
          )}
        </>
      }
    >
      {step === 1 && (
        <p className="onboarding-note">
          Browse recipes, explore new flavours and keep your favourites close.
        </p>
      )}
      {step === 3 && (
        <p className="onboarding-note">
          Bring your ingredients and questions. Mia helps you decide what to cook.
        </p>
      )}
      {step === PREFS_STEP && (
        <PreferenceChoices preferences={prefs} onChange={setPrefs} disabled={busy} />
      )}
      {step === NOTIFY_STEP && (
        <p className="onboarding-note">
          {pushSupported
            ? "We’ll ask for your device’s permission next. You can change your choice in Settings."
            : "Push notifications aren’t available on this device yet. You can still read MealMate updates in the app."}
        </p>
      )}
    </OnboardingLayout>
  );
}
