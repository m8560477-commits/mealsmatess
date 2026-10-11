// MealMate personalization preferences.
// Guests keep answers locally; signed-in users sync them to their profile.

export type FoodPreferences = {
  goal: string | null;
  favorite_foods: string[];
  allergies: string[];
  dietary_restrictions: string[];
  disliked_foods: string[];
  meals_per_day: string | null;
  cooking_level: string | null;
  cooking_time: string | null;
  food_budget: string | null;
  preferred_features: string[];
  onboarding_completed: boolean;
  updated_at: string | null;
};

export const EMPTY_PREFERENCES: FoodPreferences = {
  goal: null,
  favorite_foods: [],
  allergies: [],
  dietary_restrictions: [],
  disliked_foods: [],
  meals_per_day: null,
  cooking_level: null,
  cooking_time: null,
  food_budget: null,
  preferred_features: [],
  onboarding_completed: false,
  updated_at: null,
};

const KEY = "mealmate.preferences.v1";
const SEEN_KEY = "mealmate.onboarding-seen.v1";
export const PREFERENCES_EVENT = "mealmate:preferences";

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

export function normalizePreferences(raw: unknown): FoodPreferences {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    goal: asString(o["goal"]),
    favorite_foods: asStringArray(o["favorite_foods"]),
    allergies: asStringArray(o["allergies"]),
    dietary_restrictions: asStringArray(o["dietary_restrictions"]),
    disliked_foods: asStringArray(o["disliked_foods"]),
    meals_per_day: asString(o["meals_per_day"]),
    cooking_level: asString(o["cooking_level"]),
    cooking_time: asString(o["cooking_time"]),
    food_budget: asString(o["food_budget"]),
    preferred_features: asStringArray(o["preferred_features"]),
    onboarding_completed: o["onboarding_completed"] === true,
    updated_at: asString(o["updated_at"]),
  };
}

export function readLocalPreferences(): FoodPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalPreferences(prefs: FoodPreferences): void {
  if (typeof window === "undefined") return;
  const next = { ...prefs, updated_at: new Date().toISOString() };
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.localStorage.setItem(SEEN_KEY, "1");
  window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT));
}

export function clearLocalPreferences(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
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
  return [...prefs.allergies, ...prefs.dietary_restrictions, ...prefs.disliked_foods]
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 2);
}

export function isAvoided(prefs: FoodPreferences, ...text: (string | null | undefined | string[])[]): boolean {
  const hay = haystack(...text);
  if (!hay) return false;
  return avoidTerms(prefs).some((term) => hay.includes(term));
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
  if (prefs.goal === "Eat healthier" || prefs.goal === "Lose weight") {
    if (/(healthy|salad|veg|grill|light|bowl)/.test(hay)) score += 2;
  }
  if (prefs.goal === "Build muscle" || prefs.goal === "Gain weight") {
    if (/(protein|chicken|beef|steak|egg|bean)/.test(hay)) score += 2;
  }
  if (prefs.goal === "Save money" || prefs.food_budget === "Budget friendly") {
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
  if (!prefs || !prefs.onboarding_completed) return items;
  return items
    .map((item, i) => ({ item, i, score: preferenceScore(prefs, ...textOf(item)) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.item);
}

/** A short line the AI and UI can use to explain the user's taste. */
export function preferenceSummary(prefs: FoodPreferences): string {
  const bits: string[] = [];
  if (prefs.goal) bits.push(`Goal: ${prefs.goal}`);
  if (prefs.favorite_foods.length) bits.push(`Enjoys: ${prefs.favorite_foods.join(", ")}`);
  if (prefs.allergies.length) bits.push(`Must avoid: ${prefs.allergies.join(", ")}`);
  if (prefs.dietary_restrictions.length) bits.push(`Diet: ${prefs.dietary_restrictions.join(", ")}`);
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
