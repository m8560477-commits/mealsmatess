import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const requiredFirebaseEnv = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingFirebaseEnv = Object.entries(requiredFirebaseEnv)
  .filter(([, value]) => !value)
  .map(([key]) => `VITE_FIREBASE_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`);

if (missingFirebaseEnv.length > 0) {
  throw new Error(`Missing Firebase web configuration: ${missingFirebaseEnv.join(", ")}`);
}

if (requiredFirebaseEnv.projectId !== "mealmate-d2e53") {
  throw new Error(
    `Firebase project mismatch: expected mealmate-d2e53, received ${requiredFirebaseEnv.projectId}`,
  );
}

const firebaseConfig = {
  ...requiredFirebaseEnv,
  ...(import.meta.env.FIREBASE_MEASUREMENT_ID
    ? { measurementId: import.meta.env.FIREBASE_MEASUREMENT_ID }
    : {}),
} as {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const analytics =
  import.meta.env.SSR || !firebaseConfig.measurementId
    ? Promise.resolve(null)
    : import("firebase/analytics").then(async ({ getAnalytics, isSupported }) =>
        (await isSupported()) ? getAnalytics(app) : null,
      );
export const db = getFirestore(
  app,
  import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || "default",
);
export const storage = getStorage(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

let authStateReady: Promise<void> | null = null;

export async function waitForFirebaseAuth() {
  if (!authStateReady) {
    authStateReady = new Promise<void>((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, () => {
        unsubscribe();
        resolve();
      });
    });
  }
  await authStateReady;
  return auth.currentUser;
}

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  _path: string | null,
) {
  const code =
    error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
  const known = [
    "permission-denied",
    "unauthenticated",
    "unavailable",
    "not-found",
    "resource-exhausted",
  ].includes(code)
    ? code
    : "unknown";
  // No email, UID, provider data, document paths or raw service response in browser logs/UI.
  console.error("MealMate data operation failed", { operationType, code: known });
  throw new Error(
    known === "permission-denied" || known === "unauthenticated"
      ? "You do not have access to this data. Please sign in again."
      : "MealMate could not access your data. Check your connection and try again.",
  );
}

export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

export async function signInWithGoogle() {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "auth/popup-blocked") {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw error;
  }
}

export async function signInWithEmail(email: string, pass: string) {
  return signInWithEmailAndPassword(auth, email, pass);
}

export async function signUpWithEmail(email: string, pass: string, displayName?: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  if (displayName && cred.user) {
    await updateProfile(cred.user, { displayName });
  }
  return cred;
}

export async function sendPasswordReset(email: string, continueUrl?: string) {
  return sendPasswordResetEmail(
    auth,
    email,
    continueUrl ? { url: continueUrl, handleCodeInApp: false } : undefined,
  );
}

export async function signOutUser() {
  // Bound module loading as well as provider cleanup, so logout works offline.
  const cleanup = Promise.allSettled([
    import("@/lib/push-client").then((module) => module.disconnectPushDevice()),
    import("@/lib/revenuecat-client").then((module) => module.disconnectPurchases()),
  ]);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      cleanup,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 4_000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
  return firebaseSignOut(auth);
}

export { getRedirectResult, onAuthStateChanged, type User };
