import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  platform: "android",
  native: vi.fn(),
  credential: vi.fn(),
  popup: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => mocks.platform } }));
vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: { signInWithGoogle: mocks.native },
}));
vi.mock("firebase/auth", async (original) => ({
  ...(await original<typeof import("firebase/auth")>()),
  signInWithCredential: mocks.credential,
  signInWithPopup: mocks.popup,
  signInWithRedirect: mocks.redirect,
}));
import { googleProvider, signInWithGoogle } from "@/lib/firebase";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.platform = "android";
});
it("exchanges the Android Google credential into the existing Firebase JS session", async () => {
  mocks.native.mockResolvedValue({ credential: { idToken: "synthetic-google-token" } });
  mocks.credential.mockResolvedValue({ user: { uid: "synthetic" } });
  expect(await signInWithGoogle()).toEqual({ user: { uid: "synthetic" } });
  expect(mocks.native).toHaveBeenCalledWith({ skipNativeAuth: true });
  expect(mocks.credential).toHaveBeenCalledOnce();
  expect(mocks.popup).not.toHaveBeenCalled();
});
it("does not create a session if native Google returns no credential", async () => {
  mocks.native.mockResolvedValue({});
  await expect(signInWithGoogle()).rejects.toThrow("sign-in token");
  expect(mocks.credential).not.toHaveBeenCalled();
});
it("retains the existing web popup and redirect fallback", async () => {
  mocks.platform = "web";
  mocks.popup.mockRejectedValue({ code: "auth/popup-blocked" });
  await expect(signInWithGoogle()).resolves.toBeNull();
  expect(mocks.redirect).toHaveBeenCalledOnce();
  expect(googleProvider.getCustomParameters()).toEqual({ prompt: "select_account" });
  expect(mocks.native).not.toHaveBeenCalled();
});
