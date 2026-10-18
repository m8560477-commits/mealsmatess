import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: { uid: "alice" } as { uid: string } | null,
  configure: vi.fn(),
  changeUser: vi.fn(),
  purchase: vi.fn(),
  restore: vi.fn(),
  offers: vi.fn(),
  info: vi.fn(),
  native: false,
  platform: "web",
  nativeConfigure: vi.fn(),
  nativeLogin: vi.fn(),
  eligibility: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({
  auth: {
    get currentUser() {
      return mocks.user;
    },
  },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mocks.native, getPlatform: () => mocks.platform },
}));
vi.mock("@revenuecat/purchases-js", () => ({
  Purchases: {
    isConfigured: () => true,
    getSharedInstance: () => ({
      changeUser: mocks.changeUser,
      purchase: mocks.purchase,
      getOfferings: mocks.offers,
      getCustomerInfo: mocks.info,
    }),
    configure: mocks.configure,
  },
}));
vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    configure: mocks.nativeConfigure,
    logIn: mocks.nativeLogin,
    getOfferings: mocks.offers,
    purchasePackage: mocks.purchase,
    restorePurchases: mocks.restore,
    checkTrialOrIntroductoryPriceEligibility: mocks.eligibility,
  },
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.user = { uid: "alice" };
  mocks.native = false;
  mocks.platform = "web";
  vi.stubEnv("VITE_REVENUECAT_WEB_API_KEY", "public-test-web");
  vi.stubEnv("VITE_REVENUECAT_IOS_API_KEY", "public-test-ios");
  mocks.changeUser.mockResolvedValue({});
  mocks.purchase.mockResolvedValue({});
  mocks.info.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());
it("loads actual provider prices and offers, purchases as the Firebase UID, and restores web account history", async () => {
  mocks.offers.mockResolvedValue({
    current: {
      availablePackages: [
        {
          identifier: "monthly",
          webBillingProduct: {
            title: "Monthly Premium",
            price: { formattedPrice: "R 89.00" },
            normalPeriodDuration: "P1M",
            freeTrialPhase: { periodDuration: "P14D" },
          },
        },
      ],
    },
  });
  const { loadPurchaseOffers, restorePurchaseHistory } = await import("@/lib/purchases.client");
  const [offer] = await loadPurchaseOffers("alice");
  expect(offer).toMatchObject({ price: "R 89.00", period: "P1M", trial14: true });
  expect(mocks.changeUser).toHaveBeenCalledWith("alice");
  await offer!.purchase();
  expect(mocks.purchase).toHaveBeenCalledOnce();
  await restorePurchaseHistory("alice");
  expect(mocks.info).toHaveBeenCalledOnce();
});
it("rejects a stale purchase when the authenticated account changes", async () => {
  mocks.offers.mockResolvedValue({
    current: {
      availablePackages: [
        {
          identifier: "monthly",
          webBillingProduct: { title: "Premium", price: { formattedPrice: "$9" } },
        },
      ],
    },
  });
  const { loadPurchaseOffers } = await import("@/lib/purchases.client");
  const [offer] = await loadPurchaseOffers("alice");
  mocks.user = { uid: "bob" };
  await expect(offer!.purchase()).rejects.toThrow(/account changed/);
  expect(mocks.purchase).not.toHaveBeenCalled();
});
it("shows only confirmed iOS trial eligibility and calls native restore", async () => {
  mocks.native = true;
  mocks.platform = "ios";
  mocks.offers.mockResolvedValue({
    current: {
      availablePackages: [
        {
          identifier: "annual",
          product: {
            identifier: "ios-year",
            title: "Annual",
            priceString: "$90",
            subscriptionPeriod: "P1Y",
            introPrice: { price: 0, period: "P2W" },
          },
        },
      ],
    },
  });
  mocks.eligibility.mockResolvedValue({ "ios-year": { status: 1 } });
  const { loadPurchaseOffers, restorePurchaseHistory } = await import("@/lib/purchases.client");
  expect((await loadPurchaseOffers("alice"))[0]?.trial14).toBe(false);
  mocks.eligibility.mockResolvedValue({ "ios-year": { status: 2 } });
  expect((await loadPurchaseOffers("alice"))[0]?.trial14).toBe(true);
  expect(mocks.nativeConfigure).toHaveBeenCalledWith({
    apiKey: "public-test-ios",
    appUserID: "alice",
  });
  await restorePurchaseHistory("alice");
  expect(mocks.restore).toHaveBeenCalledOnce();
});
it("reports missing setup and provider failures without synthetic offers", async () => {
  vi.stubEnv("VITE_REVENUECAT_WEB_API_KEY", "");
  const { loadPurchaseOffers } = await import("@/lib/purchases.client");
  await expect(loadPurchaseOffers("alice")).rejects.toThrow(/not configured/);
  expect(mocks.offers).not.toHaveBeenCalled();
});
