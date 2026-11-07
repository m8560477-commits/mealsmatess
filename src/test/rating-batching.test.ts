import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/engagement.functions", () => ({ getRecipeRatingSummaries: mocks.read }));
import { loadRatingSummary } from "@/lib/rating-summary";
it("batches visible recipes and deduplicates matching IDs without inventing ratings", async () => {
  mocks.read.mockResolvedValue({ dish: { average: 4, count: 2 } });
  const [a, b, missing] = await Promise.all([
    loadRatingSummary("dish"),
    loadRatingSummary("dish"),
    loadRatingSummary("missing"),
  ]);
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ data: { recipeIds: ["dish", "missing"] } });
  expect(a).toEqual(b);
  expect(missing).toBeNull();
});
it("propagates a failed batch so React Query can expose a retry", async () => {
  mocks.read.mockRejectedValueOnce(new Error("offline"));
  await expect(loadRatingSummary("failed")).rejects.toThrow("offline");
});
