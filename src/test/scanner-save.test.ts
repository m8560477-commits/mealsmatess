import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveScanResult } from "@/lib/scanner-save";
import { scanResult } from "./scanner-fixtures";
const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: "test-user" } as { uid: string } | null },
  set: vi.fn(),
  commit: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ auth: mocks.auth, db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: mocks.collection,
  doc: mocks.doc,
  writeBatch: () => ({ set: mocks.set, commit: mocks.commit }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.currentUser = { uid: "test-user" };
  mocks.collection.mockImplementation((_db, ...path) => path.join("/"));
  mocks.doc.mockImplementation((path) => ({ id: `item-${mocks.doc.mock.calls.length}`, path }));
  mocks.commit.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());
const options = {
  destination: "planner",
  date: "2026-10-22",
  mealType: "Lunch",
  logNutrition: true,
} as const;
describe("scanner save boundaries", () => {
  it("commits planner and optional portion log atomically to the current user's paths", async () => {
    await saveScanResult(scanResult(), options);
    expect(mocks.set).toHaveBeenCalledTimes(2);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(mocks.set.mock.calls[0]).toEqual([
      expect.objectContaining({ path: "users/test-user/mealPlans" }),
      expect.objectContaining({ user_id: "test-user", custom_name: "Test tomato bowl" }),
    ]);
    expect(mocks.set.mock.calls[1][1]).toMatchObject({ calories: 120, servings: 1 });
  });
  it("never logs a barcode's 100g values as a consumed portion", async () => {
    await saveScanResult({ ...scanResult(), mode: "barcode", source: "open_food_facts" }, options);
    expect(mocks.set).toHaveBeenCalledTimes(1);
  });
  it("omits null optional pantry strings to satisfy the existing security rules", async () => {
    await saveScanResult(
      { ...scanResult(), mode: "ingredients" },
      { ...options, destination: "pantry" },
    );
    expect(mocks.set.mock.calls[0][1]).not.toHaveProperty("quantity");
    expect(mocks.set.mock.calls[0][0].path).toBe("users/test-user/pantry");
  });
  it("does not write when signed out or offline", async () => {
    mocks.auth.currentUser = null;
    await expect(saveScanResult(scanResult(), options)).rejects.toThrow(/Sign in/);
    mocks.auth.currentUser = { uid: "test-user" };
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await expect(saveScanResult(scanResult(), options)).rejects.toThrow(/Reconnect/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it("surfaces an atomic write failure", async () => {
    mocks.commit.mockRejectedValue(new Error("Permission denied"));
    await expect(saveScanResult(scanResult(), options)).rejects.toThrow("Permission denied");
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });
});
