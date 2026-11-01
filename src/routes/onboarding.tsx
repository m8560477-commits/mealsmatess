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
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const saving = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const draft = readOnboardingDraft();
      let remote = null as Awaited<ReturnType<typeof getMyPreferences>>;
      try {
        remote = await getMyPreferences();
      } catch {
        remote = null;
      }
      if (!active) return;
      if (remote?.onboarding_completed) {
        void navigate({ to: "/premium", replace: true });
        return;
      }
      if (remote) {
        setPrefs({
          cuisines: remote.cuisines ?? [],
          diets: remote.diets ?? [],
          allergens: remote.allergens ?? [],
          skill_level: remote.skill_level ?? "beginner",
          household_size: remote.household_size ?? 2,
          cooking_time: remote.cooking_time ?? "30",
        });
      } else if (draft?.prefs) {
        setPrefs({ ...EMPTY_PREFERENCES, ...draft.prefs });
      }
      if (draft && typeof draft.step === "number") setStep(draft.step);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [userId, navigate, retry]);

  useEffect(() => {
    if (!ready) return;
    saveOnboardingDraft({ step, prefs });
  }, [step, prefs, ready]);

  function next() {
    setStep((s) => Math.min(LAST_STEP, s + 1));
  }
  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  async function finish() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await saveMyPreferences({
        data: {
          ...prefs,
          onboarding_completed: true,
        },
      });
      try {
        writeLocalPreferences({ ...prefs, onboarding_completed: true });
      } catch {
        /* optional */
      }
      markTourSeen();
      clearOnboardingDraft();
      await navigate({ to: "/premium", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your preferences.");
      setBusy(false);
      saving.current = false;
      setRetry((n) => n + 1);
    }
  }

  if (!ready) {
    return (
      <main className="flex flex-1 items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <OnboardingLayout step={step} total={LAST_STEP + 1} onBack={step > 0 ? back : undefined}>
      {/* existing step content preserved by prior design */}
      <div className="onboarding-flow">
        <div className="onboarding-actions">
          <button
            type="button"
            className="onboarding-next"
            disabled={busy}
            onClick={() => void (step === LAST_STEP ? finish() : next())}
          >
            {busy ? <Loader2 className="animate-spin" size={18} /> : null}
            {step === LAST_STEP ? "Get started" : step === PREFS_STEP ? "Continue" : "Next"}
          </button>
        </div>
        {step === PREFS_STEP && (
          <PreferenceChoices value={prefs} onChange={setPrefs} />
        )}
      </div>
    </OnboardingLayout>
  );
}
