import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDoc, getDocs } from "firebase/firestore";
import { auth } from "@/lib/firebase";
import { myFavoritesQuery, myPlannerQuery } from "@/lib/queries";

vi.mock("@/lib/firebase", () => ({
  auth: { currentUser: { uid: "owner" } },
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: "list" },
}));
vi.mock("@/lib/recipe-catalog.functions", () => ({
  listRecipeCatalog: vi.fn(),
  getRecipeCatalogEntry: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, path) => path),
  doc: vi.fn((_db, collection, id) => `${collection}/${id}`),
  query: vi.fn((collection) => collection),
  orderBy: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
}));

const recipe = { name: "Test dinner", slug: "test-dinner", ingredients: [] };
const snapshot = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

beforeEach(() => {
  vi.clearAllMocks();
  (auth as unknown as { currentUser: unknown }).currentUser = { uid: "owner" };
  vi.mocked(getDoc).mockResolvedValue({
    ...snapshot("recipe-1", recipe),
    exists: () => true,
  } as never);
});

describe("personal recipe relationships", () => {
  it("loads recipe details for favorites so Cookbook and the planner have names", async () => {
    vi.mocked(getDocs).mockResolvedValue({
      docs: [snapshot("favorite-1", { recipe_id: "recipe-1" })],
    } as never);
    const rows = await myFavoritesQuery().queryFn!({} as never);
    expect(getDocs).toHaveBeenCalledWith("users/owner/favorites");
    expect(getDoc).toHaveBeenCalledWith("recipes/recipe-1");
    expect(rows?.[0].recipes).toEqual(expect.objectContaining({ id: "recipe-1", ...recipe }));
  });

  it("loads recipe details once when several meals use the same recipe", async () => {
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        snapshot("meal-1", { recipe_id: "recipe-1", meal_type: "Lunch" }),
        snapshot("meal-2", { recipe_id: "recipe-1", meal_type: "Dinner" }),
      ],
    } as never);
    const rows = await myPlannerQuery("2026-10-19", "2026-10-25").queryFn!({} as never);
    expect(getDocs).toHaveBeenCalledWith("users/owner/mealPlans");
    expect(getDoc).toHaveBeenCalledTimes(1);
    expect(rows?.map((row) => row.recipes?.slug)).toEqual(["test-dinner", "test-dinner"]);
  });

  it("returns null for deleted recipes and preserves custom meal names", async () => {
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        snapshot("deleted", { recipe_id: "missing" }),
        snapshot("custom", { custom_name: "Leftovers" }),
      ],
    } as never);
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    const rows = await myPlannerQuery("2026-10-19", "2026-10-25").queryFn!({} as never);
    expect(rows?.map((row) => row.recipes)).toEqual([null, null]);
    expect(rows?.[1].custom_name).toBe("Leftovers");
  });

  it("does not read personal data while signed out", async () => {
    (auth as unknown as { currentUser: unknown }).currentUser = null;
    expect(await myFavoritesQuery().queryFn!({} as never)).toEqual([]);
    expect(await myPlannerQuery("2026-10-19", "2026-10-25").queryFn!({} as never)).toEqual([]);
    expect(getDocs).not.toHaveBeenCalled();
    expect(getDoc).not.toHaveBeenCalled();
  });
});
