import { normalizePreferences, type FoodPreferences } from "@/lib/preferences";

const key = (userId: string) => `mealmate.onboarding-draft.v1:${userId}`;

/** Personal onboarding uses steps 0–6 (seven screens in OnboardingLayout). */
const MIN_STEP = 0;
const MAX_STEP = 6;

export function readOnboardingDraft(
  userId: string,
): { step: number; preferences: FoodPreferences } | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(userId)) ?? "null");
    if (!value || !Number.isInteger(value.step) || value.step < MIN_STEP || value.step > MAX_STEP)
      return null;
    return { step: value.step, preferences: normalizePreferences(value.preferences) };
  } catch {
    return null;
  }
}
export function saveOnboardingDraft(userId: string, step: number, preferences: FoodPreferences) {
  try {
    const clamped = Math.min(MAX_STEP, Math.max(MIN_STEP, step));
    localStorage.setItem(key(userId), JSON.stringify({ step: clamped, preferences }));
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
