import { useEffect, useState } from "react";
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
  provider: "firebase";
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
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(auth.currentUser);
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

    const checkInactivity = async (fbUser: FirebaseUser) => {
      const lastActivity = readLastActivity(fbUser.uid);
      if (lastActivity && Date.now() - lastActivity > INACTIVITY_LIMIT_MS) {
        await signOutUser();
        return false;
      }
      currentUserId = fbUser.uid;
      writeActivity(fbUser.uid);
      lastWritten = Date.now();
      return true;
    };

    const unsubscribeActivity = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) return;
      void checkInactivity(fbUser);
    });

    window.addEventListener("pointerdown", recordActivity, { passive: true });
    window.addEventListener("keydown", recordActivity, { passive: true });
    window.addEventListener("visibilitychange", recordActivity);

    return () => {
      active = false;
      unsubscribeFb();
      unsubscribeActivity();
      window.removeEventListener("pointerdown", recordActivity);
      window.removeEventListener("keydown", recordActivity);
      window.removeEventListener("visibilitychange", recordActivity);
    };
  }, []);

  const loading = fbLoading;

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
  }

  return {
    session: firebaseUser,
    firebaseUser,
    loading,
    user,
  };
}

export async function signOutUnified() {
  await signOutUser();
}
