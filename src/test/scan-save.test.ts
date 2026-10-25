import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  set: vi.fn(),
  commit: vi.fn(),
  uid: "alice",
  next: 0,
  batch: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return { uid: m.uid };
    },
  },
}));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...path: string[]) => path.join("/"),
  doc: (path: string) => ({ path: `${path}/id-${++m.next}`, id: `id-${m.next}` }),
  writeBatch: m.batch,
}));
import { saveScannedDish, saveScannedIngredients } from "@/lib/scan-save";
const dish = { is_food: true, name: "Salad", confidence: 0.8, ingredients: [], calories: 250 };
beforeEach(() => {
  vi.clearAllMocks();
  m.uid = "alice";
  m.next = 0;
  m.batch.mockReturnValue({ set: m.set, commit: m.commit });
  m.commit.mockResolvedValue(undefined);
});
describe("scan persistence", () => {
  it("commits the meal and its nutrition together with existing owner fields and paths", async () => {
    await saveScannedDish("alice", dish, "2026-10-25", "Lunch");
    expect(m.batch).toHaveBeenCalledOnce();
    expect(m.set).toHaveBeenCalledTimes(2);
    expect(m.set).toHaveBeenNthCalledWith(
      1,
      { path: "users/alice/mealPlans/id-1", id: "id-1" },
      expect.objectContaining({
        id: "id-1",
        user_id: "alice",
        custom_name: "Salad",
        plan_date: "2026-10-25",
        meal_type: "Lunch",
      }),
    );
    expect(m.set).toHaveBeenNthCalledWith(
      2,
      { path: "users/alice/nutritionLogs/id-2", id: "id-2" },
      expect.objectContaining({
        id: "id-2",
        user_id: "alice",
        calories: 250,
        protein_g: null,
        servings: 1,
      }),
    );
    expect(m.commit).toHaveBeenCalledOnce();
  });
  it("propagates failed commits without starting a second independent write", async () => {
    m.commit.mockRejectedValueOnce(new Error("permission denied"));
    await expect(saveScannedDish("alice", dish, "2026-10-25", "Lunch")).rejects.toThrow(
      "permission denied",
    );
    expect(m.commit).toHaveBeenCalledOnce();
  });
  it("commits pantry items together and omits absent optional strings required by the rules", async () => {
    await saveScannedIngredients("alice", [
      { name: "tomato" },
      { name: "eggs", quantity: "2", category: "protein" },
    ]);
    expect(m.set).toHaveBeenCalledTimes(2);
    const first = m.set.mock.calls[0]![1];
    expect(first).toMatchObject({ name: "tomato", source: "scan", user_id: "alice" });
    expect(first).not.toHaveProperty("quantity");
    expect(first).not.toHaveProperty("category");
    expect(m.commit).toHaveBeenCalledOnce();
  });
  it("rejects cross-account saves before creating any writes", async () => {
    m.uid = "bob";
    await expect(saveScannedDish("alice", dish, "2026-10-25", "Lunch")).rejects.toThrow(
      /Sign in again/,
    );
    await expect(saveScannedIngredients("alice", [{ name: "tomato" }])).rejects.toThrow(
      /Sign in again/,
    );
    expect(m.batch).not.toHaveBeenCalled();
  });
});
