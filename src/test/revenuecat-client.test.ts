import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  platform: vi.fn(),
  auth: { currentUser: { uid: "one" } as { uid: string } | null },
  configure: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  info: vi.fn(),
  offerings: vi.fn(),
  purchase: vi.fn(),
  restore: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: mocks.platform } }));
vi.mock("@/lib/firebase", () => ({ auth: mocks.auth }));
vi.mock("@revenuecat/purchases-capacitor", () => ({
  LOG_LEVEL: { ERROR: "ERROR" },
  Purchases: {
    setLogLevel: vi.fn(),
    configure: mocks.configure,
    logIn: mocks.login,
    logOut: mocks.logout,
    getCustomerInfo: mocks.info,
    getOfferings: mocks.offerings,
    purchasePackage: mocks.purchase,
    restorePurchases: mocks.restore,
  },
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.auth.currentUser = { uid: "one" };
  mocks.platform.mockReturnValue("android");
  vi.stubEnv("VITE_REVENUECAT_ANDROID_API_KEY", "goog_test_only");
  mocks.offerings.mockResolvedValue({
    current: {
      availablePackages: [
        {
          identifier: "monthly",
          product: { identifier: "sku", title: "Monthly", priceString: "R199.00" },
        },
      ],
    },
    all: {},
  });
});
it("initializes with authenticated identity and changes accounts before purchases", async () => {
  const client = await import("@/lib/revenuecat-client");
  const packages = await client.loadStorePackages("one");
  expect(mocks.configure).toHaveBeenCalledWith({ apiKey: "goog_test_only", appUserID: "one" });
  expect(packages[0].product.priceString).toBe("R199.00");
  mocks.auth.currentUser = { uid: "two" };
  await client.loadStorePackages("two");
  expect(mocks.login).toHaveBeenCalledWith({ appUserID: "two" });
  await client.disconnectPurchases();
  expect(mocks.logout).toHaveBeenCalledOnce();
});
it("rejects missing configuration and empty offerings without fabricating products", async () => {
  const client = await import("@/lib/revenuecat-client");
  vi.stubEnv("VITE_REVENUECAT_ANDROID_API_KEY", "");
  await expect(client.loadStorePackages("one")).rejects.toThrow(/not configured/);
  vi.stubEnv("VITE_REVENUECAT_ANDROID_API_KEY", "goog_test_only");
  mocks.offerings.mockResolvedValue({ current: null });
  await expect(client.loadStorePackages("one")).rejects.toThrow(/No subscription packages/);
});
it("propagates purchase cancellation and supports actual SDK restore response", async () => {
  const client = await import("@/lib/revenuecat-client");
  const [pkg] = await client.loadStorePackages("one");
  mocks.purchase.mockRejectedValue({ userCancelled: true });
  await expect(client.purchaseStorePackage("one", pkg)).rejects.toMatchObject({
    userCancelled: true,
  });
  mocks.restore.mockResolvedValue({ customerInfo: { entitlements: { active: {} } } });
  expect(await client.restoreStorePurchases("one")).toEqual({ entitlements: { active: {} } });
});
