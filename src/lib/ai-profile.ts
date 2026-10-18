import { normalizePreferences } from "@/lib/preferences";

/** Read current onboarding answers, falling back to profiles saved before onboarding. */
export function aiProfile<T extends object>(profile: T | null) {
  if (!profile) return null;
  const row = profile as Record<string, unknown>;
  const saved = row["preferences"];
  const preferences = normalizePreferences({
    goal: row["goal"],
    allergies: row["allergies"],
    dietary_restrictions: row["dietary_preferences"],
    ...(saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {}),
  });
  return {
    ...profile,
    goal: preferences.goal,
    allergies: preferences.allergies,
    dietary_preferences: preferences.dietary_restrictions,
    preferences,
  };
}
