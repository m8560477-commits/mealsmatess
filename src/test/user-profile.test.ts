import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDoc, setDoc } from "firebase/firestore";
import { ensureUserProfile } from "@/lib/user-profile";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({ path: "users/user-1" })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}));

const user = {
  uid: "user-1",
  email: "chef@example.test",
  displayName: "Chef",
  photoURL: null,
};
beforeEach(() => vi.clearAllMocks());

describe("sign-in profile initialization", () => {
  it("preserves returning users' profile choices and server-managed fields", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true } as never);
    await ensureUserProfile(user);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("creates the initial profile for a new account", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await ensureUserProfile(user);
    expect(setDoc).toHaveBeenCalledWith(
      { path: "users/user-1" },
      expect.objectContaining({
        id: user.uid,
        email: user.email,
        displayName: "Chef",
        goal: "healthy_cooking",
      }),
      { merge: true },
    );
  });

  it("does not overwrite a profile when reading it fails", async () => {
    vi.mocked(getDoc).mockRejectedValue(new Error("offline"));
    await expect(ensureUserProfile(user)).rejects.toThrow("offline");
    expect(setDoc).not.toHaveBeenCalled();
  });
});
