import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { auth, onAuthStateChanged, signOutUser, type User as FirebaseUser } from "@/lib/firebase";

const INACTIVITY_LIMIT_MS = 40 * 24 * 60 * 60 * 1000;
const ACTIVITY_KEY_PREFIX = "mealmate:last-activity:";

export interface SessionUser {
  id: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  emailVerified?: boolean;
  provider: "firebase" | "supabase";
}

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
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [sbLoading, setSbLoading] = useState(true);
  const [fbLoading, setFbLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let currentUserId: string | null = null;
    let lastWritten = 0;

    const recordActivity = () => {
      if (!currentUserId || Date.now() - lastWritten < 60_000) return;
      lastWritten = Date.now();
      writeActivity(currentUserId);
    };

    const unsubscribeFb = onAuthStateChanged(auth, (fbUser) => {
      if (!active) return;
      setFirebaseUser(fbUser);
      setFbLoading(false);
      if (fbUser) {
        currentUserId = fbUser.uid;
        writeActivity(fbUser.uid);
        lastWritten = Date.now();
      }
    });

    const applySupabaseSession = async (nextSession: Session | null) => {
      if (!active) return;
      const userId = nextSession?.user.id ?? null;
      if (userId) {
        const lastActivity = readLastActivity(userId);
        if (lastActivity && Date.now() - lastActivity > INACTIVITY_LIMIT_MS) {
          await supabase.auth.signOut();
          if (active) setSupabaseSession(null);
          return;
        }
        currentUserId = userId;
        writeActivity(userId);
        lastWritten = Date.now();
      }
      setSupabaseSession(nextSession);
    };

    supabase.auth.getSession().then(({ data }) => {
      void applySupabaseSession(data.session).finally(() => {
        if (active) setSbLoading(false);
      });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySupabaseSession(nextSession);
    });

    window.addEventListener("pointerdown", recordActivity, { passive: true });
    window.addEventListener("keydown", recordActivity, { passive: true });
    window.addEventListener("visibilitychange", recordActivity);

    return () => {
      active = false;
      unsubscribeFb();
      sub.subscription.unsubscribe();
      window.removeEventListener("pointerdown", recordActivity);
      window.removeEventListener("keydown", recordActivity);
      window.removeEventListener("visibilitychange", recordActivity);
    };
  }, []);

  const loading = fbLoading && sbLoading;

  let user: SessionUser | null = null;
  if (firebaseUser) {
    user = {
      id: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      emailVerified: firebaseUser.emailVerified,
      email_confirmed_at: firebaseUser.emailVerified
        ? new Date().toISOString()
        : firebaseUser.email
          ? new Date().toISOString()
          : null,
      confirmed_at: firebaseUser.emailVerified
        ? new Date().toISOString()
        : firebaseUser.email
          ? new Date().toISOString()
          : null,
      provider: "firebase",
    };
  } else if (supabaseSession?.user) {
    const sbUser = supabaseSession.user;
    user = {
      id: sbUser.id,
      email: sbUser.email ?? null,
      displayName:
        (sbUser.user_metadata?.display_name as string | undefined) ??
        sbUser.email?.split("@")[0] ??
        null,
      photoURL: null,
      email_confirmed_at: sbUser.email_confirmed_at ?? null,
      confirmed_at: sbUser.confirmed_at ?? null,
      emailVerified: Boolean(sbUser.email_confirmed_at || sbUser.confirmed_at),
      provider: "supabase",
    };
  }

  return {
    session: supabaseSession,
    firebaseUser,
    loading,
    user,
  };
}

export async function signOutUnified() {
  await Promise.allSettled([signOutUser(), supabase.auth.signOut()]);
}
