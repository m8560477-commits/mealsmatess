import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { OnboardingLayout } from "@/components/OnboardingLayout";
import {
  loadLocalPreferences,
  writeLocalPreferences,
  type UserPreferences,
} from "@/lib/preferences";
import {
  getMyPreferences,
  saveMyPreferences,
} from "@/lib/preferences.functions";
import {
  markTourSeen,
} from "@/lib/preferences";
import { useSession } from "@/hooks/use-session";
import { ONBOARDING_COPY } from "@/lib/onboarding-copy";
import {
  loadOnboardingDraft,
  saveOnboardingDraft,
  clearOnboardingDraft,
  clampOnboardingStep,
} from "@/lib/onboarding-progress";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Set up MealMate" }] }),
  component: OnboardingPage,
});

const LAST_STEP = ONBOARDING_COPY.length - 1;

function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const userId = user?.id;
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Partial<UserPreferences>>({});
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const draft = loadOnboardingDraft();
      const local = loadLocalPreferences();
      let remote: UserPreferences | null = null;
      try {
        if (userId) remote = await getMyPreferences();
      } catch {
        remote = null;
      }
      if (!active) return;
      if (remote?.onboarding_completed) {
        void navigate({ to: "/premium", replace: true });
        return;
      }
      const merged = { ...local, ...remote, ...draft?.data };
      setData(merged);
      setStep(clampOnboardingStep(draft?.step ?? 0));
    })();
    return () => {
      active = false;
    };
  }, [userId, navigate, retry]);

  useEffect(() => {
    saveOnboardingDraft(step, data);
  }, [step, data]);

  const screen = useMemo(() => ONBOARDING_COPY[step]!, [step]);

  function next() {
    setStep((s) => clampOnboardingStep(s + 1));
  }
  function back() {
    setStep((s) => clampOnboardingStep(s - 1));
  }

  async function persistPartial() {
    try {
      if (userId) {
        await saveMyPreferences({ data: { ...data, onboarding_completed: false } });
      }
    } catch {
      /* local draft still held */
    }
  }

  async function finish() {
    setBusy(true);
    try {
      await saveMyPreferences({ data: { ...data, onboarding_completed: true } });
      try {
        const prefs = loadLocalPreferences();
        writeLocalPreferences({ ...prefs, onboarding_completed: true });
      } catch {
        /* optional */
      }
      markTourSeen();
      clearOnboardingDraft();
      await navigate({ to: "/premium", replace: true });
    } catch {
      setBusy(false);
      setRetry((n) => n + 1);
    }
  }

  return (
    <OnboardingLayout
      step={step}
      total={ONBOARDING_COPY.length}
      title={screen.title}
      subtitle={screen.subtitle}
      busy={busy}
      onBack={step > 0 ? back : undefined}
      onNext={() => void (step === LAST_STEP ? finish() : (persistPartial(), next()))}
      nextLabel={step === LAST_STEP ? "Continue" : "Next"}
    >
      {/* step body is rendered inside layout via children patterns in real file */}
      <div className="onboarding-step-body" data-step={step}>
        {screen.body ? <p className="onboarding-body">{screen.body}</p> : null}
      </div>
    </OnboardingLayout>
  );
}
