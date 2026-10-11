// Tracks the single most-recently-opened recipe so the home screen can show
// a "Continue Cooking" card. This is intentionally lightweight (no backend
// table) — it lives in localStorage, same pattern as the theme toggle.

const KEY = "mealmate-continue-cooking";

export interface ContinueCookingEntry {
  slug: string;
  name: string;
  image_url: string | null;
  cooking_time_minutes: number | null;
  calories: number | null;
  progress: number; // 0-100
  updatedAt: number;
}

export function getContinueCooking(): ContinueCookingEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ContinueCookingEntry;
  } catch {
    return null;
  }
}

export function setContinueCooking(entry: Omit<ContinueCookingEntry, "progress" | "updatedAt">) {
  if (typeof window === "undefined") return;
  const existing = getContinueCooking();
  // Bump progress a little each time the recipe is reopened, capped at 90%
  // (100% would imply "done" — we don't have a real completion signal yet).
  const progress =
    existing?.slug === entry.slug ? Math.min(90, existing.progress + 15) : 20;
  const next: ContinueCookingEntry = { ...entry, progress, updatedAt: Date.now() };
  window.localStorage.setItem(KEY, JSON.stringify(next));
}

export function clearContinueCooking() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
