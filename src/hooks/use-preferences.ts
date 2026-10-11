import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import {
  EMPTY_PREFERENCES,
  PREFERENCES_EVENT,
  clearLocalPreferences,
  readLocalPreferences,
  writeLocalPreferences,
  type FoodPreferences,
} from "@/lib/preferences";
import { getMyPreferences, saveMyPreferences } from "@/lib/preferences.functions";

/**
 * Preferences work for guests (local only) and sync up to the profile
 * whenever a session exists. Local answers win when they are newer.
 */
export function usePreferences() {
  const { user } = useSession();
  const [prefs, setPrefs] = useState<FoodPreferences | null>(() => readLocalPreferences());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sync = () => setPrefs(readLocalPreferences());
    window.addEventListener(PREFERENCES_EVENT, sync);
    window.addEventListener("storage", sync);
    sync();
    setLoading(false);
    return () => {
      window.removeEventListener(PREFERENCES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // On sign-in: push local answers up, or pull down what the account has.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const local = readLocalPreferences();
        const remote = await getMyPreferences();
        if (cancelled) return;
        const localNewer =
          local?.onboarding_completed &&
          (!remote?.onboarding_completed ||
            (local.updated_at ?? "") > (remote.updated_at ?? ""));
        if (localNewer && local) {
          const { updated_at: _drop, ...rest } = local;
          await saveMyPreferences({ data: rest });
        } else if (remote?.onboarding_completed) {
          writeLocalPreferences(remote);
        }
      } catch {
        // offline or not provisioned yet — local answers still apply
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const save = useCallback(
    async (next: FoodPreferences) => {
      writeLocalPreferences(next);
      setPrefs(next);
      if (user) {
        const { updated_at: _drop, ...rest } = next;
        try {
          await saveMyPreferences({ data: rest });
        } catch (err) {
          // Local copy is kept; surface the failure so callers can tell the user.
          console.error("[preferences] save failed", err);
          throw err;
        }
      }
    },
    [user],
  );

  const reset = useCallback(() => {
    clearLocalPreferences();
    setPrefs(null);
  }, []);

  return {
    preferences: prefs ?? EMPTY_PREFERENCES,
    hasPreferences: Boolean(prefs?.onboarding_completed),
    loading,
    save,
    reset,
  };
}
