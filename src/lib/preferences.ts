// MealMate personalization preferences.
// Guests keep answers locally; signed-in users sync them to their profile.

import { conflictsWithText, prohibitedIngredients } from "@/lib/recipe-safety";
import { PreferencesSchema, type PersonalPreferences } from "@/lib/onboarding-model";
export type FoodPreferences = PersonalPreferences;
export const EMPTY_PREFERENCES: FoodPreferences = PreferencesSchema.parse({});

const KEY = "mealmate.preferences.v1";
const SEEN_KEY = "mealmate.onboarding-seen.v1";
export const PREFERENCES_EVENT = "mealmate:preferences";

export function normalizePreferences(raw: unknown): FoodPreferences {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const merged = {
    ...o,
    goals: Array.isArray(o.goals) ? o.goals : typeof o.goal === "string" ? [o.goal] : [],
  };
  const fields: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(PreferencesSchema.shape)) {
    const result = schema.safeParse(merged[key as keyof typeof merged]);
    if (result.success) fields[key] = result.data;
  }
  return PreferencesSchema.parse(fields);
}
function scopedKey(userId?: string) {
  return userId ? `${KEY}:${userId}` : KEY;
}

export function readLocalPreferences(userId?: string): FoodPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedKey(userId));
    if (!raw) return null;
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalPreferences(prefs: FoodPreferences, userId?: string): void {
  if (typeof window === "undefined") return;
  const next = prefs;
  try {
    window.localStorage.setItem(scopedKey(userId), JSON.stringify(next));
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* Remote persistence still works when browser storage is unavailable. */
  }
  window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT));
}

export function clearLocalPreferences(userId?: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(scopedKey(userId));
  window.localStorage.removeItem(SEEN_KEY);
  window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT));
}

/** True when the intro has never been shown or dismissed on this device. */
export function shouldOfferOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SEEN_KEY) !== "1";
}

export function markOnboardingSeen(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEEN_KEY, "1");
  window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT));
}

// ---------- personalization helpers ----------

function haystack(...parts: (string | null | undefined | string[])[]): string {
  return parts
    .flatMap((p) => (Array.isArray(p) ? p : [p]))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Anything the user must not be served: allergies, restrictions, dislikes. */
export function avoidTerms(prefs: FoodPreferences): string[] {
  return prohibitedIngredients(prefs);
}

export function isAvoided(
  prefs: FoodPreferences,
  ...text: (string | null | undefined | string[])[]
): boolean {
  const hay = haystack(...text);
  if (!hay) return false;
  return conflictsWithText(prefs, hay);
}

/** Higher is a better match for this user. */
export function preferenceScore(
  prefs: FoodPreferences,
  ...text: (string | null | undefined | string[])[]
): number {
  const hay = haystack(...text);
  if (!hay) return 0;
  if (isAvoided(prefs, hay)) return -100;
  let score = 0;
  for (const like of prefs.favorite_foods) {
    if (hay.includes(like.toLowerCase())) score += 3;
  }
  if (
    prefs.goals.includes("Eat healthier") ||
    prefs.goal === "Eat healthier" ||
    prefs.goal === "Lose weight"
  ) {
    if (/(healthy|salad|veg|grill|light|bowl)/.test(hay)) score += 2;
  }
  if (
    prefs.goals.includes("Support my fitness goals") ||
    prefs.goal === "Build muscle" ||
    prefs.goal === "Gain weight"
  ) {
    if (/(protein|chicken|beef|steak|egg|bean)/.test(hay)) score += 2;
  }
  if (
    prefs.goals.includes("Save money on groceries") ||
    prefs.goal === "Save money" ||
    prefs.food_budget === "Budget friendly"
  ) {
    if (/(budget|value|affordable|simple|deal)/.test(hay)) score += 1;
  }
  return score;
}

/** Sort a list so better-matching, non-avoided items come first (stable). */
export function personalize<T>(
  prefs: FoodPreferences | null,
  items: T[],
  textOf: (item: T) => (string | null | undefined | string[])[],
): T[] {
  if (!prefs) return items;
  return items
    .map((item, i) => ({ item, i, score: preferenceScore(prefs, ...textOf(item)) }))
    .filter((entry) => entry.score > -100)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.item);
}

/** A short line the AI and UI can use to explain the user's taste. */
export function preferenceSummary(prefs: FoodPreferences): string {
  const bits: string[] = [];
  if (prefs.goals.length) bits.push(`Goals: ${prefs.goals.join(", ")}`);
  else if (prefs.goal) bits.push(`Goal: ${prefs.goal}`);
  if (prefs.country) bits.push(`Country: ${prefs.country}`);
  bits.push(`Household: ${prefs.household_size}`, `Language: ${prefs.language}`);
  if (prefs.diets.length) bits.push(`Diet preferences: ${prefs.diets.join(", ")}`);
  if (prefs.budget_amount !== null)
    bits.push(`Budget: ${prefs.budget_currency} ${prefs.budget_amount} per ${prefs.budget_period}`);
  if (prefs.meal_types.length)
    bits.push(`Meals: ${prefs.meal_types.join(", ")}; planning: ${prefs.planning_style}`);
  if (prefs.favorite_foods.length) bits.push(`Enjoys: ${prefs.favorite_foods.join(", ")}`);
  if (prefs.allergies.length) bits.push(`Must avoid: ${prefs.allergies.join(", ")}`);
  if (prefs.dietary_restrictions.length)
    bits.push(`Diet: ${prefs.dietary_restrictions.join(", ")}`);
  if (prefs.disliked_foods.length) bits.push(`Dislikes: ${prefs.disliked_foods.join(", ")}`);
  if (prefs.cooking_time) bits.push(`Time to cook: ${prefs.cooking_time}`);
  if (prefs.cooking_level) bits.push(`Skill: ${prefs.cooking_level}`);
  if (prefs.food_budget) bits.push(`Budget: ${prefs.food_budget}`);
  return bits.join(" · ");
}

const TOUR_KEY = "mealmate.tour-seen.v1";
/** Welcome + app tour shown once per device before sign-up. */
export function hasSeenTour(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return true;
  }
}
export function markTourSeen(): void {
  try {
    window.localStorage.setItem(TOUR_KEY, "1");
  } catch {
    /* ignore */
  }
}
