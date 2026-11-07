import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: { uid: "owner", getIdToken: vi.fn().mockResolvedValue("synthetic") },
  auth: { currentUser: null as unknown, onAuthStateChanged: vi.fn(() => vi.fn()) },
  updateDoc: vi.fn(),
  updateProfile: vi.fn(),
  deleteObject: vi.fn(),
  getDownloadURL: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ auth: mocks.auth, db: {}, storage: {} }));
vi.mock("firebase/auth", () => ({ updateProfile: mocks.updateProfile }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => path.join("/"),
  updateDoc: mocks.updateDoc,
  serverTimestamp: () => "server-time",
}));
vi.mock("firebase/storage", () => ({
  ref: (_storage: unknown, path: string) => path,
  deleteObject: mocks.deleteObject,
  getDownloadURL: mocks.getDownloadURL,
  uploadBytesResumable: mocks.upload,
}));
import {
  cropGeometry,
  uploadProfilePhoto,
  removeProfilePhoto,
  validateProfileImage,
  MAX_PROFILE_IMAGE_BYTES,
  profilePhotoError,
} from "@/lib/profile-photo";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.currentUser = mocks.user;
  mocks.updateDoc.mockResolvedValue(undefined);
  mocks.updateProfile.mockResolvedValue(undefined);
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.getDownloadURL.mockResolvedValue(
    "https://firebasestorage.googleapis.com/avatar?alt=media&token=synthetic",
  );
  mocks.upload.mockReturnValue({
    cancel: vi.fn(),
    on: (_event: string, progress: (value: object) => void, _error: unknown, done: () => void) => {
      progress({ bytesTransferred: 25, totalBytes: 100 });
      done();
    },
  });
});
describe("Firebase profile photos", () => {
  it("accepts supported images and rejects oversized, empty and executable formats", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"])
      expect(() => validateProfileImage(new File(["image"], "photo", { type }))).not.toThrow();
    for (const file of [
      new File(["html"], "photo.jpg", { type: "text/html" }),
      new File([], "empty.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array(MAX_PROFILE_IMAGE_BYTES + 1)], "large.jpg", { type: "image/jpeg" }),
    ])
      expect(() => validateProfileImage(file)).toThrow();
  });
  it("crops portraits and landscapes without leaving blank space at extreme positions", () => {
    expect(cropGeometry(1200, 800, { zoom: 1, x: 100, y: 100 })).toEqual({
      side: 800,
      left: 400,
      top: 0,
    });
    expect(cropGeometry(800, 1200, { zoom: 2, x: 100, y: 100 })).toEqual({
      side: 400,
      left: 400,
      top: 800,
    });
  });
  it("uploads compressed JPEG with progress, preserves the old object until replacement, merges account then syncs Auth", async () => {
    const progress = vi.fn();
    const result = await uploadProfilePhoto(
      "owner",
      new Blob(["jpeg"], { type: "image/jpeg" }),
      progress,
    );
    expect(mocks.upload.mock.calls[0][0]).toBe("users/owner/profile/avatar.jpg");
    expect(progress).toHaveBeenCalledWith(25);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.updateDoc).toHaveBeenCalledWith("users/owner", {
      photoURL: result.photoURL,
      photoUpdatedAt: "server-time",
    });
    expect(result.photoURL).toContain("&v=");
    expect(mocks.updateProfile).toHaveBeenCalledWith(mocks.user, { photoURL: result.photoURL });
    expect(result.authSynced).toBe(true);
  });
  it("never updates profile references on upload failure", async () => {
    mocks.upload.mockReturnValueOnce({
      on: (_event: string, _progress: unknown, error: (value: Error) => void) =>
        error(new Error("Offline")),
    });
    await expect(
      uploadProfilePhoto("owner", new Blob(["jpeg"], { type: "image/jpeg" }), vi.fn()),
    ).rejects.toThrow("Offline");
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
  it("reports partial Auth synchronization honestly after Firestore saves", async () => {
    mocks.updateProfile.mockRejectedValueOnce(new Error("Offline"));
    expect(
      (await uploadProfilePhoto("owner", new Blob(["jpeg"], { type: "image/jpeg" }), vi.fn()))
        .authSynced,
    ).toBe(false);
  });
  it("removes an avatar and clears Auth without deleting the user document", async () => {
    await removeProfilePhoto("owner");
    expect(mocks.deleteObject).toHaveBeenCalledWith("users/owner/profile/avatar.jpg");
    expect(mocks.updateDoc).toHaveBeenCalledWith("users/owner", {
      photoURL: "",
      photoUpdatedAt: "server-time",
    });
    expect(mocks.updateProfile).toHaveBeenCalledWith(mocks.user, { photoURL: "" });
  });
  it("retries removal if the object already disappeared but does not swallow permission errors", async () => {
    mocks.deleteObject.mockRejectedValueOnce({ code: "storage/object-not-found" });
    await removeProfilePhoto("owner");
    mocks.updateDoc.mockClear();
    mocks.deleteObject.mockRejectedValueOnce({ code: "storage/unauthorized" });
    await expect(removeProfilePhoto("owner")).rejects.toEqual({ code: "storage/unauthorized" });
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
  it("rejects expired sessions and other UIDs before modifying Storage", async () => {
    mocks.auth.currentUser = null;
    await expect(removeProfilePhoto("owner")).rejects.toThrow("session");
    mocks.auth.currentUser = mocks.user;
    await expect(
      uploadProfilePhoto("other", new Blob(["jpeg"], { type: "image/jpeg" }), vi.fn()),
    ).rejects.toThrow("session");
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(profilePhotoError({ code: "auth/user-token-expired" })).toContain("Sign in again");
  });
});
