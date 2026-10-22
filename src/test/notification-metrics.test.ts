import { expect, it, vi } from "vitest";
import { campaignMetrics } from "@/server/notification-metrics";
it("uses server aggregation and counts legacy records independently from outcome fields", async () => {
  const count = vi
    .fn()
    .mockReturnValueOnce({ get: async () => ({ data: () => ({ count: 10000 }) }) })
    .mockReturnValueOnce({ get: async () => ({ data: () => ({ count: 5 }) }) });
  const aggregate = vi
    .fn()
    .mockReturnValue({ get: async () => ({ data: () => ({ accepted: 20, failed: 2 }) }) });
  const fullRead = vi.fn(() => {
    throw new Error("Full recipient scan forbidden");
  });
  const base = { where: vi.fn(), count, aggregate, get: fullRead };
  base.where.mockReturnValue(base);
  const db = { collectionGroup: vi.fn().mockReturnValue(base) };
  expect(await campaignMetrics(db as never, "campaign")).toEqual({
    recipientCount: 10000,
    pendingCount: 5,
    pushAcceptedTokens: 20,
    pushFailedTokens: 2,
    pushAttemptedTokens: 22,
  });
  expect(fullRead).not.toHaveBeenCalled();
  expect(count).toHaveBeenCalledTimes(2);
  expect(aggregate).toHaveBeenCalledOnce();
});
