// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
vi.mock("@/server/firebase-admin", async () => {
  const a = await import("firebase-admin/app");
  const f = await import("firebase-admin/firestore");
  return { getFirebaseAdminFirestore: () => f.getFirestore(a.getApp("mia-context-integration")) };
});
import { loadMiaContext } from "@/server/mia-context";
const enabled = !!process.env.FIRESTORE_EMULATOR_HOST;
describe.skipIf(!enabled)("Mia's user-scoped context", () => {
  const app = initializeApp({ projectId: "demo-mealmate-paywall" }, "mia-context-integration");
  const db = getFirestore(app);
  beforeAll(async () => {
    await db.doc("users/mia-a").set({ preferences: { allergies: ["peanuts"] } });
    await db.doc("users/mia-b").set({ preferences: { allergies: ["milk"] } });
    await db.doc("users/mia-a/pantry/a").set({ user_id: "mia-a", name: "rice", quantity: "1 cup" });
    await db.doc("users/mia-a/pantry/forged").set({ user_id: "mia-b", name: "not owned" });
    await db.doc("users/mia-b/pantry/b").set({ user_id: "mia-b", name: "private" });
  });
  afterAll(async () => {
    await db.recursiveDelete(db.doc("users/mia-a"));
    await db.recursiveDelete(db.doc("users/mia-b"));
    await deleteApp(app);
  });
  it("reads only the verified user's profile and pantry", async () => {
    const result = await loadMiaContext("mia-a", true);
    expect(result.profile?.preferences).toEqual({ allergies: ["peanuts"] });
    expect(result.pantry).toEqual([{ name: "rice", quantity: "1 cup" }]);
  });
  it("handles missing profiles and doesn't read pantry for typed chat", async () => {
    expect(await loadMiaContext("missing", false)).toEqual({ profile: null, pantry: [] });
    expect((await loadMiaContext("mia-a", false)).pantry).toEqual([]);
  });
});
