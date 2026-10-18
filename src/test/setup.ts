import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

for (const [key, value] of Object.entries({
  VITE_FIREBASE_API_KEY: "test-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "mealmate-d2e53.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "mealmate-d2e53",
  VITE_FIREBASE_STORAGE_BUCKET: "mealmate-d2e53.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
  VITE_FIREBASE_APP_ID: "1:1234567890:web:test",
  VITE_FIREBASE_FIRESTORE_DATABASE_ID: "default",
})) {
  vi.stubEnv(key, value);
}

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
