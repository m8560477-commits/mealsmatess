import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  getRedirectResult,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
  type UserCredential,
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

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
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

// Google blocks sign-in inside embedded web views, so the Median Android/iOS app signs in with
// its native Google plugin instead (Social Login > Google Sign-In in the Median app builder).
// The plugin hands back a Google ID token, which Firebase accepts as a credential. The bridge
// only exists inside a Median build that has the plugin enabled; everywhere else this is skipped.
type MedianGoogleResponse = { idToken?: string; credential?: string; error?: string };
type MedianBridge = {
  socialLogin?: {
    google?: {
      login?: (options: { callback: (response: MedianGoogleResponse) => void }) => void;
    };
  };
};

function medianGoogleLogin() {
  if (typeof window === "undefined") return undefined;
  const login = (window as unknown as { median?: MedianBridge }).median?.socialLogin?.google?.login;
  return typeof login === "function" ? login : undefined;
}

function signInWithMedianGoogle(login: NonNullable<ReturnType<typeof medianGoogleLogin>>) {
  return new Promise<UserCredential>((resolve, reject) => {
    login({
      callback: (response) => {
        const idToken = response?.idToken ?? response?.credential;
        if (!idToken) {
          // An empty response is a dismissed sheet; reuse the code the pages already stay quiet on.
          reject(
            response?.error
              ? new Error(response.error)
              : Object.assign(new Error("Google sign-in was cancelled."), {
                  code: "auth/popup-closed-by-user",
                }),
          );
          return;
        }
        signInWithCredential(auth, GoogleAuthProvider.credential(idToken)).then(resolve, reject);
      },
    });
  });
}

export async function signInWithGoogle() {
  const nativeLogin = medianGoogleLogin();
  if (nativeLogin) return signInWithMedianGoogle(nativeLogin);
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
  return firebaseSignOut(auth);
}

export { getRedirectResult, onAuthStateChanged, type User };
