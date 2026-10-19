import { beforeEach, describe, expect, it, vi } from "vitest";
import { where } from "firebase/firestore";
import { firebaseData } from "@/lib/firebase-data";

vi.mock("@/lib/firebase", () => ({ auth: { currentUser: { uid: "user-1" } }, db: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    collection: vi.fn(() => ({})),
    query: vi.fn(() => ({})),
    // Use the real SDK to reject invalid operators before any network call.
    where: vi.fn(actual.where),
    getDocs: vi.fn(async () => ({ docs: [] })),
  };
});

beforeEach(() => vi.clearAllMocks());

describe("browser Firestore query filters", () => {
  it.each([
    ["eq", "==", "recipe-1"],
    ["gt", ">", 1],
    ["gte", ">=", 1],
    ["lt", "<", 5],
    ["lte", "<=", 5],
    ["in", "in", ["recipe-1"]],
    ["is", "==", null],
  ] as const)("translates %s into the SDK operator %s", async (method, operator, value) => {
    const result = await firebaseData.from("favorites")[method]("recipe_id", value as never);
    expect(result.error).toBeNull();
    expect(where).toHaveBeenCalledWith("recipe_id", operator, value);
  });

  it("scopes order lookups to the signed-in customer with a valid equality filter", async () => {
    const result = await firebaseData.from("restaurant_orders").select();
    expect(result.error).toBeNull();
    expect(where).toHaveBeenCalledWith("customer_id", "==", "user-1");
  });

  it("rejects another customer's orders before querying Firestore", async () => {
    const result = await firebaseData.from("restaurant_orders").eq("customer_id", "other-user");
    expect(result.error?.message).toContain("Forbidden");
    expect(where).not.toHaveBeenCalled();
  });
});
