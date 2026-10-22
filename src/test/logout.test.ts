import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), cleanup: vi.fn() }));
vi.mock("firebase/auth", async (original) => ({
  ...(await original<typeof import("firebase/auth")>()),
  signOut: mocks.signOut,
}));
vi.mock("@/lib/push-client", () => ({ disconnectPushDevice: mocks.cleanup }));
vi.mock("@/lib/revenuecat-client", () => ({ disconnectPurchases: mocks.cleanup }));
afterEach(() => {
  vi.useRealTimers();
});
it("signs out even when provider cleanup never resolves", async () => {
  vi.useFakeTimers();
  mocks.cleanup.mockReturnValue(new Promise(() => {}));
  const { signOutUser } = await import("@/lib/firebase");
  const pending = signOutUser();
  await vi.advanceTimersByTimeAsync(4_001);
  await pending;
  expect(mocks.signOut).toHaveBeenCalledOnce();
});
