import { beforeEach, describe, expect, it, vi } from "vitest";
import { initializeApp } from "firebase/app";

vi.mock("firebase/app", () => ({
  getApps: () => [],
  initializeApp: vi.fn(() => ({})),
}));
vi.mock("firebase/auth", () => ({
  getAuth: () => ({}),
  GoogleAuthProvider: class {},
  getRedirectResult: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  updateProfile: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(),
  doc: vi.fn(),
  getDocFromServer: vi.fn(),
}));
vi.mock("firebase/storage", () => ({ getStorage: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("SSR", true);
  vi.stubEnv("VITE_FIREBASE_API_KEY", "test-api-key");
  vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "mealmate-d2e53");
  vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "");
  vi.stubEnv("FIREBASE_MEASUREMENT_ID", "");
});

describe("Firebase web configuration", () => {
  it("passes the documented optional Analytics setting to Firebase", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-SYNTHETIC");
    const { analytics } = await import("@/lib/firebase");
    expect(initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ measurementId: "G-SYNTHETIC" }),
    );
    await expect(analytics).resolves.toBeNull();
  });

  it("preserves the existing Vercel Analytics setting", async () => {
    vi.stubEnv("FIREBASE_MEASUREMENT_ID", "G-LEGACY");
    await import("@/lib/firebase");
    expect(initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ measurementId: "G-LEGACY" }),
    );
  });

  it("prefers the documented setting when both names exist", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-NEW");
    vi.stubEnv("FIREBASE_MEASUREMENT_ID", "G-LEGACY");
    await import("@/lib/firebase");
    expect(initializeApp).toHaveBeenCalledWith(expect.objectContaining({ measurementId: "G-NEW" }));
  });

  it("does not require Analytics to initialize the application", async () => {
    await import("@/lib/firebase");
    expect(initializeApp).toHaveBeenCalledWith(
      expect.not.objectContaining({ measurementId: expect.anything() }),
    );
  });

  it("rejects missing required public settings before initializing Firebase", async () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "");
    await expect(import("@/lib/firebase")).rejects.toThrow(
      "Missing Firebase web configuration: VITE_FIREBASE_API_KEY",
    );
    expect(initializeApp).not.toHaveBeenCalled();
  });

  it("prevents accidentally connecting the application to another project", async () => {
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "unrelated-project");
    await expect(import("@/lib/firebase")).rejects.toThrow("Firebase project mismatch");
    expect(initializeApp).not.toHaveBeenCalled();
  });
});
