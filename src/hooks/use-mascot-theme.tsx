import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  getTheme,
  type MascotTheme,
  type MascotThemeId,
} from "@/lib/mascot-theme";

type Ctx = { theme: MascotTheme; setTheme: (id: MascotThemeId) => Promise<void>; saving: boolean };
const ThemeCtx = createContext<Ctx | null>(null);

export function MascotThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [themeId, setThemeId] = useState<MascotThemeId>("classic");
  const [saving, setSaving] = useState(false);

  // Local theme first (works signed out).
  useEffect(() => {
    try {
      const local = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (local) setThemeId(getTheme(local).id);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Account theme wins when signed in, so it follows the user across devices.
  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase
      .from("profiles")
      .select("theme")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("[theme] load failed", error);
          return;
        }
        const remote = (data as { theme?: string } | null)?.theme;
        if (active && remote) {
          const id = getTheme(remote).id;
          setThemeId(id);
          try {
            window.localStorage.setItem(THEME_STORAGE_KEY, id);
          } catch {
            /* ignore */
          }
        }
      });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  const setTheme = useCallback(
    async (id: MascotThemeId) => {
      const previous = themeId;
      applyTheme(id, true);
      setThemeId(id);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, id);
      } catch {
        /* ignore */
      }
      if (!user) return;
      setSaving(true);
      const { error } = await supabase.from("profiles").update({ theme: id } as never).eq("id", user.id);
      setSaving(false);
      if (error) {
        console.error("[theme] save failed", error);
        toast.error("Couldn't save your theme to your account. Please try again.");
        applyTheme(previous, true);
        setThemeId(previous);
      }
    },
    [themeId, user],
  );

  const value = useMemo(() => ({ theme: getTheme(themeId), setTheme, saving }), [themeId, setTheme, saving]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useMascotTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useMascotTheme must be used inside <MascotThemeProvider>");
  return ctx;
}
