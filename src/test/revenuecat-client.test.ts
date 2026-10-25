import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  auth: { currentUser: { uid: "alice" } as { uid: string } | null },
  configure: vi.fn(),
  logIn: vi.fn(),
  logOut: vi.fn(),
  purchasePackage: vi.fn(),
  restorePurchases: vi.fn(),
  getOfferings: vi.fn(),
  config: vi.fn(),
  preflight: vi.fn(),
  refresh: vi.fn(),
  onAuth: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "android" } }));
vi.mock("@revenuecat/purchases-capacitor", () => ({ Purchases: m }));
vi.mock("@/lib/firebase", () => ({ auth: m.auth, onAuthStateChanged: m.onAuth }));
vi.mock("@/lib/billing/revenuecat.functions", () => ({
  getNativeBillingConfig: m.config,
  prepareNativePurchase: m.preflight,
  refreshNativeAccess: m.refresh,
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  m.auth.currentUser = { uid: "alice" };
  m.config.mockResolvedValue({
    androidKey: "goog_synthetic",
    offering: "default",
    productIds: [],
    environment: "PRODUCTION",
  });
  m.getOfferings.mockResolvedValue({ all: { default: { availablePackages: [] } } });
  m.refresh.mockResolvedValue({ active: true, sandbox: false });
  m.restorePurchases.mockResolvedValue({
    customerInfo: { entitlements: { active: { Premium: {} } } },
  });
});
describe("native account operations", () => {
  it("binds Firebase UID and only returns server verification", async () => {
    const b = await import("@/lib/billing/revenuecat.client");
    m.refresh.mockResolvedValue({ active: false, sandbox: false });
    expect(await b.nativeAction("alice", "restore")).toEqual({ active: false, sandbox: false });
    expect(m.configure).toHaveBeenCalledWith({ apiKey: "goog_synthetic", appUserID: "alice" });
    expect(m.preflight).not.toHaveBeenCalled();
  });
  it("does not verify a completed restore against a newly switched Firebase account", async () => {
    const b = await import("@/lib/billing/revenuecat.client");
    m.restorePurchases.mockImplementation(async () => {
      m.auth.currentUser = { uid: "bob" };
      return {};
    });
    await expect(b.nativeAction("alice", "restore")).rejects.toThrow("store action completed");
    expect(m.refresh).not.toHaveBeenCalled();
  });
  it("serializes login behind an open store sheet", async () => {
    const b = await import("@/lib/billing/revenuecat.client");
    let release!: () => void;
    m.restorePurchases.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const first = b.nativeAction("alice", "restore");
    const failure = expect(first).rejects.toThrow("store action completed");
    await vi.waitFor(() => expect(m.restorePurchases).toHaveBeenCalled());
    m.auth.currentUser = { uid: "bob" };
    const second = b.nativeOffers("bob");
    await Promise.resolve();
    expect(m.logIn).not.toHaveBeenCalled();
    release();
    await failure;
    await second;
    expect(m.logIn).toHaveBeenCalledWith({ appUserID: "bob" });
  });
  it("warns against buying twice when verification fails after a store action", async () => {
    const b = await import("@/lib/billing/revenuecat.client");
    m.refresh.mockRejectedValue(new Error("network"));
    await expect(b.nativeAction("alice", "restore")).rejects.toThrow(
      "Refresh access before purchasing again",
    );
  });
});
