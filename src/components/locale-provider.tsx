import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import i18nInstance from "@/lib/i18n";

/**
 * Syncs the active i18n language with:
 *  1. The signed-in user's `profiles.locale` (source of truth when signed in)
 *  2. Local storage (guest fallback)
 *  3. A cross-tab / cross-component event so a language change propagates
 *     instantly without an app restart.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  // Keep a value import so production tree-shaking cannot drop i18n setup.
  const { i18n = i18nInstance } = useTranslation();
  const { user } = useSession();

  const { data } = useQuery({
    queryKey: ["locale", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("locale")
        .eq("id", user!.id)
        .maybeSingle();
      return (data as { locale?: string } | null)?.locale ?? null;
    },
  });

  // Initial local-storage hydration (guests).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("mealmate-lang");
    if (stored && stored !== i18n.language) void i18n.changeLanguage(stored);
  }, [i18n]);

  // Profile-driven sync.
  useEffect(() => {
    if (data && data !== i18n.language) void i18n.changeLanguage(data);
  }, [data, i18n]);

  // Cross-component instant updates.
  useEffect(() => {
    function onChange(e: Event) {
      const lang = (e as CustomEvent<string>).detail;
      if (lang && lang !== i18n.language) void i18n.changeLanguage(lang);
    }
    window.addEventListener("mealmate-lang-changed", onChange);
    return () => window.removeEventListener("mealmate-lang-changed", onChange);
  }, [i18n]);

  return <>{children}</>;
}
