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

const PREFS_STEP = 4;
const NOTIFY_STEP = 5;
const LAST_STEP = 6;

function PersonalOnboarding({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<FoodPreferences>(EMPTY_PREFERENCES);
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const draft = readOnboardingDraft();
      try {
        const remote = await getMyPreferences();
        if (!active) return;
        if (remote?.onboarding_completed) {
          void navigate({ to: "/premium", replace: true });
          return;
        }
        if (remote) {
          setPrefs({
            cuisines: remote.cuisines ?? EMPTY_PREFERENCES.cuisines,
            diets: remote.diets ?? EMPTY_PREFERENCES.diets,
            allergens: remote.allergens ?? EMPTY_PREFERENCES.allergens,
            skill_level: remote.skill_level ?? EMPTY_PREFERENCES.skill_level,
            household_size: remote.household_size ?? EMPTY_PREFERENCES.household_size,
            cooking_time: remote.cooking_time ?? EMPTY_PREFERENCES.cooking_time,
          });
        } else if (draft?.preferences) {
          setPrefs({ ...EMPTY_PREFERENCES, ...draft.preferences });
        }
        if (typeof draft?.step === "number") setStep(draft.step);
      } catch {
        if (draft?.preferences) setPrefs({ ...EMPTY_PREFERENCES, ...draft.preferences });
        if (typeof draft?.step === "number") setStep(draft.step);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, navigate, retry]);

  useEffect(() => {
    if (loading) return;
    saveOnboardingDraft({ step, preferences: prefs });
  }, [step, prefs, loading]);

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
      if (notifyEnabled) {
        try {
          await saveMyNotificationPreferences({ data: { meal_reminders: true, tips: true } });
          if (!Capacitor.isNativePlatform()) {
            const token = await requestBrowserPushToken();
            if (token) await registerMyPushToken({ data: { token, platform: "web" } });
          }
        } catch {
          /* notifications optional during onboarding */
        }
      }
      markTourSeen();
      clearOnboardingDraft();
      await navigate({ to: "/premium", replace: true });
    } catch (error) {
      started.current = false;
      setBusy(false);
      toast.error(error instanceof Error ? error.message : "Could not finish setup.");
      setRetry((n) => n + 1);
    }
  }

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
      total={LAST_STEP + 1}
      onBack={step > 0 && !busy ? back : undefined}
      footer={
        <button
          type="button"
          className="onboarding-cta"
          disabled={busy}
          onClick={() => void (step === LAST_STEP ? finish() : next())}
        >
          {busy ? <Loader2 className="animate-spin" size={18} /> : null}
          {step === LAST_STEP ? "Get started" : step === PREFS_STEP ? "Continue" : "Next"}
        </button>
      }
    >
      {step === 1 && (
        <p className="onboarding-copy">Tell us how you cook so Mia can help in the kitchen.</p>
      )}
      {step === 3 && (
        <p className="onboarding-copy">We will personalise recipes around your household.</p>
      )}
      {step === PREFS_STEP && <PreferenceChoices value={prefs} onChange={setPrefs} />}
      {step === NOTIFY_STEP && (
        <label className="onboarding-notify">
          <input
            type="checkbox"
            checked={notifyEnabled}
            onChange={(e) => setNotifyEnabled(e.target.checked)}
          />
          <span>Send me meal reminders and cooking tips</span>
        </label>
      )}
    </OnboardingLayout>
  );
}
