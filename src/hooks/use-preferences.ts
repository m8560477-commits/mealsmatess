import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

export function usePreferences() {
  const { user, loading: sessionLoading } = useSession();
  const id = user?.id;
  const qc = useQueryClient();
  const [cache, setCache] = useState<{ id: string | undefined; prefs: FoodPreferences | null }>({
    id,
    prefs: null,
  });
  const local = cache.id === id ? cache.prefs : null;
  const setLocal = useCallback((prefs: FoodPreferences | null) => setCache({ id, prefs }), [id]);
  const remote = useQuery({
    queryKey: ["preferences", id],
    queryFn: () => getMyPreferences(),
    enabled: !!id,
    staleTime: 30000,
  });
  useEffect(() => {
    const update = () => setLocal(readLocalPreferences(id));
    update();
    window.addEventListener(PREFERENCES_EVENT, update);
    return () => window.removeEventListener(PREFERENCES_EVENT, update);
  }, [id, setLocal]);
  const save = useCallback(
    async (next: FoodPreferences) => {
      const draft = { ...next, updated_at: next.updated_at ?? new Date().toISOString() };
      if ((readLocalPreferences(id)?.updated_at ?? "") <= draft.updated_at) {
        writeLocalPreferences(draft, id);
        setLocal(draft);
      }
      if (id) {
        const saved = await saveMyPreferences({ data: draft });
        if ((readLocalPreferences(id)?.updated_at ?? "") <= draft.updated_at) {
          writeLocalPreferences(saved, id);
          setLocal(saved);
        }
        qc.setQueryData(["preferences", id], saved);
        await qc.invalidateQueries({ queryKey: ["onboarding-experience", id] });
        await qc.invalidateQueries({ queryKey: ["recipes"] });
        await qc.invalidateQueries({ queryKey: ["profile"] });
        await qc.invalidateQueries({ queryKey: ["locale", id] });
        await qc.invalidateQueries({ queryKey: ["currency", id] });
      }
    },
    [id, qc, setLocal],
  );
  const newest = !remote.data
    ? local
    : local && (local.updated_at ?? "") > (remote.data.updated_at ?? "")
      ? local
      : remote.data;
  return {
    preferences: newest ?? EMPTY_PREFERENCES,
    hasPreferences: !!newest?.onboarding_completed,
    loading: sessionLoading || (!!id && remote.isLoading),
    error: remote.error,
    save,
    reset: () => {
      clearLocalPreferences(id);
      setLocal(null);
    },
  };
}
