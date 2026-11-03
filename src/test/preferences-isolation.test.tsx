import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EMPTY_PREFERENCES, readLocalPreferences, writeLocalPreferences } from "@/lib/preferences";
import { usePreferences } from "@/hooks/use-preferences";

const mocks = vi.hoisted(() => ({
  user: { id: "a" } as { id: string } | null,
  get: vi.fn(),
  save: vi.fn(),
}));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: mocks.user }) }));
vi.mock("@/lib/preferences.functions", () => ({
  getMyPreferences: mocks.get,
  saveMyPreferences: mocks.save,
}));
beforeEach(() => {
  localStorage.clear();
  mocks.user = { id: "a" };
  mocks.get.mockReset().mockResolvedValue(null);
  mocks.save.mockReset().mockResolvedValue({ ok: true });
});
afterEach(cleanup);

it("never displays or syncs another account's saved allergies on a shared device", async () => {
  writeLocalPreferences(
    { ...EMPTY_PREFERENCES, allergies: ["Peanuts"], onboarding_completed: true },
    "a",
  );
  const { result, rerender } = renderHook(() => usePreferences());
  await waitFor(() => expect(result.current.preferences.allergies).toEqual(["Peanuts"]));
  mocks.save.mockClear();
  mocks.user = { id: "b" };
  rerender();
  await waitFor(() => expect(result.current.preferences.allergies).toEqual([]));
  expect(mocks.save).not.toHaveBeenCalled();
  expect(readLocalPreferences("a")?.allergies).toEqual(["Peanuts"]);
  expect(readLocalPreferences("b")).toBeNull();
  await act(async () =>
    result.current.save({ ...EMPTY_PREFERENCES, allergies: ["Milk"], onboarding_completed: true }),
  );
  expect(readLocalPreferences("a")?.allergies).toEqual(["Peanuts"]);
  expect(readLocalPreferences("b")?.allergies).toEqual(["Milk"]);
});

it("does not assign unscoped legacy preferences to a signed-in account", async () => {
  writeLocalPreferences({
    ...EMPTY_PREFERENCES,
    allergies: ["Peanuts"],
    onboarding_completed: true,
  });
  const { result } = renderHook(() => usePreferences());
  await waitFor(() => expect(mocks.get).toHaveBeenCalled());
  expect(result.current.preferences.allergies).toEqual([]);
  expect(mocks.save).not.toHaveBeenCalled();
});
