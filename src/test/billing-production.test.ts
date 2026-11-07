import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  sandbox: true,
  configure: vi.fn(),
  getSharedInstance: vi.fn(),
  getOfferings: vi.fn(),
  changeUser: vi.fn(),
  purchase: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("@revenuecat/purchases-js", () => ({
  Purchases: { configure: mocks.configure, getSharedInstance: mocks.getSharedInstance },
}));
const identity = {
  appUserId: "synthetic-user",
  offering: "default" as const,
  isActive: false,
  webApiKey: "synthetic",
  androidApiKey: null,
};
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.sandbox = true;
  const sdk = {
    isSandbox: () => mocks.sandbox,
    getOfferings: mocks.getOfferings,
    changeUser: mocks.changeUser,
    purchase: mocks.purchase,
  };
  mocks.configure.mockReturnValue(sdk);
  mocks.getSharedInstance.mockReturnValue(sdk);
  mocks.getOfferings.mockResolvedValue({
    all: {
      default: {
        availablePackages: [
          {
            identifier: "$rc_monthly",
            product: {
              identifier: "premium_monthly",
              period: { number: 1, unit: "month" },
              price: { formattedPrice: "$9.99" },
            },
          },
          {
            identifier: "$rc_lifetime",
            product: { identifier: "lifetime", period: null, price: { formattedPrice: "$99.99" } },
          },
        ],
      },
    },
  });
});
it("blocks production sandbox checkout, including repeated initialization", async () => {
  const { loadBillingStore } = await import("@/lib/billing-client");
  await expect(loadBillingStore({ ...identity, production: true })).rejects.toThrow(
    /Live subscriptions/,
  );
  await expect(loadBillingStore({ ...identity, production: true })).rejects.toThrow(
    /Live subscriptions/,
  );
  expect(mocks.configure).toHaveBeenCalledOnce();
  expect(mocks.getOfferings).not.toHaveBeenCalled();
  expect(mocks.purchase).not.toHaveBeenCalled();
});
it("permits the test store in preview, while keeping the real lifetime product distinct", async () => {
  const { loadBillingStore } = await import("@/lib/billing-client");
  const result = await loadBillingStore({ ...identity, production: false });
  expect(result.plans.map(({ kind, price }) => [kind, price])).toEqual([
    ["monthly", "$9.99"],
    ["lifetime", "$99.99"],
  ]);
});
it("permits live RevenueCat billing in production", async () => {
  mocks.sandbox = false;
  const { loadBillingStore } = await import("@/lib/billing-client");
  const result = await loadBillingStore({ ...identity, production: true });
  expect(result.plans).toHaveLength(2);
});
