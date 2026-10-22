// Exact public names only. Never expose arbitrary VITE_* variables or name prefixes.
export const PUBLIC_ENV_NAMES = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_FIRESTORE_DATABASE_ID",
  "VITE_FIREBASE_VAPID_KEY",
  "FIREBASE_MEASUREMENT_ID",
  "VITE_REVENUECAT_ANDROID_API_KEY",
  "VITE_REVENUECAT_OFFERING_ID",
  "VITE_REVENUECAT_FAMILY_PACKAGE_ID",
] as const;
export function publicEnvDefinitions(env: Record<string, string | undefined>) {
  const billingKey = env.VITE_REVENUECAT_ANDROID_API_KEY;
  if (billingKey && !billingKey.startsWith("goog_"))
    throw new Error(
      "VITE_REVENUECAT_ANDROID_API_KEY must be the public Android SDK key, never a secret API key.",
    );
  return Object.fromEntries(
    PUBLIC_ENV_NAMES.map((name) => [`import.meta.env.${name}`, JSON.stringify(env[name] ?? "")]),
  );
}
