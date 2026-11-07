import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";
import { PreferenceChoices } from "@/components/onboarding-preferences";
import { EMPTY_PREFERENCES, type FoodPreferences } from "@/lib/preferences";
import { getMyPreferences, saveMyPreferences } from "@/lib/preferences.functions";
export function SettingsPreferences() {
  const { user } = useSession();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["food-preferences", user?.id],
    queryFn: () => getMyPreferences(),
    enabled: !!user,
  });
  const [draft, setDraft] = useState<FoodPreferences>(EMPTY_PREFERENCES);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (query.data && !dirty) setDraft(query.data);
  }, [query.data, dirty]);
  function change(value: FoodPreferences) {
    setDirty(true);
    setDraft(value);
  }
  return (
    <section id="food-preferences" className="settings-section">
      <h2>Food preferences</h2>
      <details>
        <summary>Edit my preferences</summary>
        {query.isPending ? (
          <p role="status">Loading preferences…</p>
        ) : query.isError ? (
          <p role="alert">
            Could not load preferences.{" "}
            <button onClick={() => void query.refetch()}>Try again</button>
          </p>
        ) : (
          <form
            className="settings-preferences"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await saveMyPreferences({ data: draft });
                client.setQueryData(["food-preferences", user?.id], draft);
                await client.invalidateQueries({ queryKey: ["preferences"] });
                setDirty(false);
                toast.success("Preferences saved");
              } catch {
                toast.error("Could not save preferences. Your changes are still here.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <PreferenceChoices preferences={draft} onChange={change} disabled={busy} />
            {(
              [
                ["disliked_foods", "Food dislikes"],
                ["preferred_cuisines", "Preferred cuisines"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  disabled={busy}
                  maxLength={1000}
                  defaultValue={(query.data?.[key] ?? []).join(", ")}
                  onChange={(e) =>
                    change({
                      ...draft,
                      [key]: e.target.value
                        .split(",")
                        .map((v) => v.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Separate with commas"
                />
              </label>
            ))}
            {(
              [
                ["cooking_time", "Cooking time"],
                ["food_budget", "Budget"],
                ["cooking_level", "Cooking experience"],
                ["meals_per_day", "Meals per day"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  disabled={busy}
                  maxLength={40}
                  value={draft[key] ?? ""}
                  onChange={(e) => change({ ...draft, [key]: e.target.value || null })}
                />
              </label>
            ))}
            <button disabled={busy || !dirty} className="settings-save">
              {busy ? "Saving…" : "Save preferences"}
            </button>
          </form>
        )}
      </details>
    </section>
  );
}
