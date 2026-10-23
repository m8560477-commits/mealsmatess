import { normalizePreferences, type FoodPreferences } from "@/lib/preferences";

const key = (userId: string) => `mealmate.onboarding-draft.v1:${userId}`;
export function readOnboardingDraft(
  userId: string,
): { step: number; preferences: FoodPreferences } | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(userId)) ?? "null");
    if (!value || !Number.isInteger(value.step) || value.step < 1 || value.step > 6) return null;
    return { step: value.step, preferences: normalizePreferences(value.preferences) };
  } catch {
    return null;
  }
}
export function saveOnboardingDraft(userId: string, step: number, preferences: FoodPreferences) {
  try {
    localStorage.setItem(key(userId), JSON.stringify({ step, preferences }));
  } catch {
    /* Resume is optional when storage is blocked. */
  }
}
export function clearOnboardingDraft(userId: string) {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    /* No persistent draft. */
  }
}
