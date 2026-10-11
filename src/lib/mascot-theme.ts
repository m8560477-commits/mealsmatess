
export type MascotThemeId = "classic" | "sunset" | "midnight" | "ocean" | "cherry" | "matcha";

export type MascotTheme = {
  id: MascotThemeId;
  name: string;
  /** Mascot artwork shown as the app logo. */
  image: string;
  /** Accent colour (light / dark mode). Black & white stays the core palette. */
  accent: string;
  accentDark: string;
  accentForeground: string;
  premium: boolean;
};

export const MASCOT_THEMES: MascotTheme[] = [
  { id: "classic", name: "Classic", image: "/mascots/mascot-classic.png", accent: "oklch(0.12 0 0)", accentDark: "oklch(0.98 0 0)", accentForeground: "oklch(0.99 0 0)", premium: false },
  { id: "sunset", name: "Sunset Kitchen", image: "/mascots/mascot-sunset.webp", accent: "oklch(0.68 0.17 55)", accentDark: "oklch(0.76 0.16 60)", accentForeground: "oklch(0.15 0.03 50)", premium: true },
  { id: "midnight", name: "Midnight", image: "/mascots/mascot-midnight.webp", accent: "oklch(0.5 0.2 275)", accentDark: "oklch(0.7 0.15 275)", accentForeground: "oklch(0.99 0 0)", premium: true },
  { id: "ocean", name: "Ocean", image: "/mascots/mascot-ocean.webp", accent: "oklch(0.6 0.14 230)", accentDark: "oklch(0.75 0.12 225)", accentForeground: "oklch(0.15 0.03 230)", premium: true },
  { id: "cherry", name: "Cherry", image: "/mascots/mascot-cherry.webp", accent: "oklch(0.55 0.2 15)", accentDark: "oklch(0.7 0.17 12)", accentForeground: "oklch(0.99 0 0)", premium: true },
  { id: "matcha", name: "Matcha", image: "/mascots/mascot-matcha.webp", accent: "oklch(0.52 0.12 140)", accentDark: "oklch(0.74 0.13 138)", accentForeground: "oklch(0.99 0 0)", premium: true },
];

export const THEME_STORAGE_KEY = "mealmate.theme.v1";

export function getTheme(id: string | null | undefined): MascotTheme {
  return MASCOT_THEMES.find((t) => t.id === id) ?? MASCOT_THEMES[0]!;
}

/** Writes the accent tokens onto <html>. Only accent-type tokens change. */
export function applyTheme(id: MascotThemeId, animate = false) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const t = getTheme(id);
  if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 350);
  }
  root.dataset["mascot"] = t.id;
  root.style.setProperty("--brand", t.accent);
  root.style.setProperty("--brand-dark", t.accentDark);
  root.style.setProperty("--brand-foreground", t.accentForeground);
}

/** Inline script for <head> so the saved theme paints before React hydrates. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var m=${JSON.stringify(
  Object.fromEntries(MASCOT_THEMES.map((t) => [t.id, [t.accent, t.accentDark, t.accentForeground]])),
)};var v=m[t]||m.classic;var r=document.documentElement;r.dataset.mascot=m[t]?t:"classic";r.style.setProperty("--brand",v[0]);r.style.setProperty("--brand-dark",v[1]);r.style.setProperty("--brand-foreground",v[2]);}catch(e){}})();`;
