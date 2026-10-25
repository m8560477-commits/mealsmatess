import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { firebaseData } from "@/lib/firebase-data";
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
  const revision = useRef(0);
  const pendingSave = useRef(false);
  const userId = user?.id;

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
    const loadRevision = ++revision.current;
    pendingSave.current = false;
    setSaving(false);
    if (!userId) return;
    let active = true;
    firebaseData
      .from("profiles")
      .select("theme")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("[theme] load failed", error);
          return;
        }
        const remote = (data as { theme?: string } | null)?.theme;
        if (active && remote && revision.current === loadRevision) {
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
      // Invalidate pending saves; this sequence counter is intentionally read at cleanup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      revision.current++;
    };
  }, [userId]);

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  const setTheme = useCallback(
    async (id: MascotThemeId) => {
      if (pendingSave.current) return;
      const saveRevision = ++revision.current;
      const previous = themeId;
      applyTheme(id, true);
      setThemeId(id);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, id);
      } catch {
        /* ignore */
      }
      if (!userId) return;
      pendingSave.current = true;
      setSaving(true);
      try {
        const { error } = await firebaseData
          .from("profiles")
          .update({ theme: id } as never)
          .eq("id", userId);
        if (error) throw error;
      } catch (error) {
        if (revision.current !== saveRevision) return;
        console.error("[theme] save failed", error);
        toast.error("Couldn't save your theme to your account. Please try again.");
        applyTheme(previous, true);
        setThemeId(previous);
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, previous);
        } catch {
          /* storage unavailable */
        }
      } finally {
        if (revision.current === saveRevision) {
          pendingSave.current = false;
          setSaving(false);
        }
      }
    },
    [themeId, userId],
  );

  const value = useMemo(
    () => ({ theme: getTheme(themeId), setTheme, saving }),
    [themeId, setTheme, saving],
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useMascotTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useMascotTheme must be used inside <MascotThemeProvider>");
  return ctx;
}
