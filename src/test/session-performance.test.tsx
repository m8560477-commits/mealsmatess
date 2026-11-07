import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
  stop: vi.fn(),
  signOut: vi.fn(),
  callback: null as null | ((user: any) => void),
}));
vi.mock("@/lib/firebase-core", () => ({
  auth: { currentUser: null },
  onIdTokenChanged: mocks.listen,
  signOutUser: mocks.signOut,
}));
import { useSession } from "@/hooks/use-session";
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mocks.listen.mockImplementation((_auth, callback) => {
    mocks.callback = callback;
    return mocks.stop;
  });
  mocks.signOut.mockResolvedValue(undefined);
});
afterEach(cleanup);
it("shares one listener and stable user identity across many consumers and releases it", () => {
  const first = renderHook(useSession);
  const second = renderHook(useSession);
  expect(mocks.listen).toHaveBeenCalledOnce();
  act(() => mocks.callback?.({ uid: "owner", email: "owner@example.test", emailVerified: true }));
  expect(first.result.current.user).toBe(second.result.current.user);
  const user = first.result.current.user;
  first.rerender();
  expect(first.result.current.user).toBe(user);
  first.unmount();
  expect(mocks.stop).not.toHaveBeenCalled();
  second.unmount();
  expect(mocks.stop).toHaveBeenCalledOnce();
});
it("clears the shared identity on logout and changes accounts without stale user data", () => {
  const { result } = renderHook(useSession);
  act(() => mocks.callback?.({ uid: "first", email: "first@example.test" }));
  act(() => mocks.callback?.(null));
  expect(result.current.user).toBeNull();
  expect(result.current.loading).toBe(false);
  act(() => mocks.callback?.({ uid: "second", email: "second@example.test" }));
  expect(result.current.user?.id).toBe("second");
});
it("checks inactivity before recording activity and signs out only once", () => {
  localStorage.setItem("mealmate:last-activity:old", String(Date.now() - 41 * 86400_000));
  renderHook(useSession);
  renderHook(useSession);
  act(() => mocks.callback?.({ uid: "old" }));
  expect(mocks.signOut).toHaveBeenCalledOnce();
});
