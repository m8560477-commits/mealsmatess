import { useSyncExternalStore } from "react";
import {
  auth,
  onIdTokenChanged,
  signOutUser,
  type User as FirebaseUser,
} from "@/lib/firebase-core";

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

type Session = {
  session: FirebaseUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  user: SessionUser | null;
};
const initial: Session = { session: null, firebaseUser: null, loading: true, user: null };
let snapshot = initial;
const listeners = new Set<() => void>();
let stop: (() => void) | undefined;

function startSession() {
  let active = true;
  let currentUserId: string | null = null;
  let lastWritten = 0;
  const recordActivity = () => {
    if (!currentUserId || Date.now() - lastWritten < 60_000) return;
    lastWritten = Date.now();
    try {
      window.localStorage.setItem(`${ACTIVITY_KEY_PREFIX}${currentUserId}`, String(lastWritten));
    } catch {
      /* Firebase sessions still work without local storage. */
    }
  };
  const unsubscribe = onIdTokenChanged(auth, (firebaseUser) => {
    if (!active) return;
    currentUserId = firebaseUser?.uid ?? null;
    if (firebaseUser) {
      let lastActivity = 0;
      try {
        lastActivity = Number(
          window.localStorage.getItem(`${ACTIVITY_KEY_PREFIX}${firebaseUser.uid}`),
        );
      } catch {
        /* Storage may be unavailable. */
      }
      if (lastActivity && Date.now() - lastActivity > INACTIVITY_LIMIT_MS) {
        // Check before recording fresh activity, once for the whole application.
        void signOutUser().catch(() => undefined);
        return;
      }
      lastWritten = 0;
      recordActivity();
    }
    const verifiedAt = firebaseUser?.emailVerified ? new Date().toISOString() : null;
    snapshot = {
      session: firebaseUser,
      firebaseUser,
      loading: false,
      user: firebaseUser
        ? {
            id: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            emailVerified: firebaseUser.emailVerified,
            email_confirmed_at: verifiedAt,
            confirmed_at: verifiedAt,
            provider: "firebase",
          }
        : null,
    };
    listeners.forEach((notify) => notify());
  });
  window.addEventListener("pointerdown", recordActivity, { passive: true });
  window.addEventListener("keydown", recordActivity, { passive: true });
  document.addEventListener("visibilitychange", recordActivity);
  return () => {
    active = false;
    unsubscribe();
    window.removeEventListener("pointerdown", recordActivity);
    window.removeEventListener("keydown", recordActivity);
    document.removeEventListener("visibilitychange", recordActivity);
    snapshot = initial;
  };
}
function subscribe(notify: () => void) {
  listeners.add(notify);
  if (listeners.size === 1) stop = startSession();
  return () => {
    listeners.delete(notify);
    if (!listeners.size) {
      stop?.();
      stop = undefined;
    }
  };
}
/** One Firebase listener and one activity tracker, shared by every mounted consumer. */
export function useSession() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => initial,
  );
}
export async function signOutUnified() {
  await signOutUser();
}
