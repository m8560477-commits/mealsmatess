import { beforeEach, describe, expect, it, vi } from "vitest";
import { firebaseAdmin } from "@/server/firebase-admin";

const mocks = vi.hoisted(() => ({
  bucket: vi.fn(),
  save: vi.fn(),
  setMetadata: vi.fn(),
  file: vi.fn(),
  download: vi.fn(),
}));
vi.mock("firebase-admin/app", () => ({
  cert: vi.fn(),
  getApps: () => [],
  initializeApp: () => ({}),
}));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({}) }));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({}),
  Timestamp: class Timestamp {},
}));
vi.mock("firebase-admin/messaging", () => ({ getMessaging: () => ({}) }));
vi.mock("firebase-admin/storage", () => ({
  getStorage: () => ({ bucket: mocks.bucket }),
  getDownloadURL: mocks.download,
}));

describe("Firebase recipe image storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      "FIREBASE_SERVICE_ACCOUNT_JSON",
      JSON.stringify({
        project_id: "mealmate-d2e53",
        client_email: "synthetic@example.test",
        private_key: "synthetic-test-key",
      }),
    );
    vi.stubEnv("FIREBASE_STORAGE_BUCKET", "  synthetic-storage-bucket \n");
    mocks.bucket.mockReturnValue({ file: mocks.file });
    mocks.file.mockReturnValue({ save: mocks.save, setMetadata: mocks.setMetadata });
    mocks.download.mockResolvedValue(
      "https://firebasestorage.googleapis.com/v0/b/synthetic/o/recipe.png?alt=media&token=synthetic",
    );
    mocks.setMetadata.mockResolvedValue(undefined);
  });

  it("uploads photo bytes and creates a persistent Firebase download URL", async () => {
    const storage = firebaseAdmin.storage.from("recipe-images");
    const uploaded = await storage.upload("recipe-1/photo.png", new Uint8Array([1, 2, 3]), {
      contentType: "image/png",
      upsert: true,
    });
    expect(uploaded.error).toBeNull();
    expect(mocks.bucket).toHaveBeenCalledWith("synthetic-storage-bucket");
    const result = await storage.createDownloadUrl("recipe-1/photo.png");
    expect(result.error).toBeNull();
    expect(result.data?.downloadUrl).toContain("alt=media&token=");
    expect(mocks.file).toHaveBeenCalledWith("recipe-images/recipe-1/photo.png");
    expect(mocks.setMetadata).toHaveBeenCalledWith({
      metadata: { firebaseStorageDownloadTokens: expect.stringMatching(/^[0-9a-f-]{36}$/) },
    });
    expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({ save: mocks.save }));
  });

  it("propagates storage metadata errors instead of saving a broken image URL", async () => {
    mocks.setMetadata.mockRejectedValueOnce(new Error("Storage permission denied"));
    const result = await firebaseAdmin.storage
      .from("recipe-images")
      .createDownloadUrl("recipe-1/photo.png");
    expect(result.error?.message).toBe("Storage permission denied");
    expect(result.data).toBeNull();
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
