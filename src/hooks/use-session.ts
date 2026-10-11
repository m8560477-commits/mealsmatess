import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const INACTIVITY_LIMIT_MS = 40 * 24 * 60 * 60 * 1000;
const ACTIVITY_KEY_PREFIX = "mealmate:last-activity:";

function activityKey(userId: string) {
  return `${ACTIVITY_KEY_PREFIX}${userId}`;
}

function readLastActivity(userId: string): number | null {
  try {
    const value = window.localStorage.getItem(activityKey(userId));
    const timestamp = value ? Number(value) : NaN;
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

function writeActivity(userId: string) {
  try {
    window.localStorage.setItem(activityKey(userId), String(Date.now()));
  } catch {
    // Session persistence still works when storage is unavailable.
  }
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let currentUserId: string | null = null;
    let lastWritten = 0;

    const recordActivity = () => {
      if (!currentUserId || Date.now() - lastWritten < 60_000) return;
      lastWritten = Date.now();
      writeActivity(currentUserId);
    };

    const applySession = async (nextSession: Session | null) => {
      if (!active) return;
      const userId = nextSession?.user.id ?? null;
      if (userId) {
        const lastActivity = readLastActivity(userId);
        if (lastActivity && Date.now() - lastActivity > INACTIVITY_LIMIT_MS) {
          await supabase.auth.signOut();
          if (active) setSession(null);
          return;
        }
        currentUserId = userId;
        writeActivity(userId);
        lastWritten = Date.now();
      } else {
        currentUserId = null;
      }
      setSession(nextSession);
    };

    supabase.auth.getSession().then(({ data }) => {
      void applySession(data.session).finally(() => {
        if (active) setLoading(false);
      });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });
    window.addEventListener("pointerdown", recordActivity, { passive: true });
    window.addEventListener("keydown", recordActivity, { passive: true });
    window.addEventListener("visibilitychange", recordActivity);
    return () => {
      active = false;
      sub.subscription.unsubscribe();
      window.removeEventListener("pointerdown", recordActivity);
      window.removeEventListener("keydown", recordActivity);
      window.removeEventListener("visibilitychange", recordActivity);
    };
  }, []);

  return { session, loading, user: session?.user ?? null };
}
