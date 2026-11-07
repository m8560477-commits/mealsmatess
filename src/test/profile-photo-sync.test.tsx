import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: { id: "owner", photoURL: "https://example.test/google.jpg" } as {
    id: string;
    photoURL: string;
  } | null,
  currentUser: { uid: "owner", photoURL: "https://example.test/google.jpg" },
  listener: null as
    null | ((snapshot: { data: () => unknown; metadata?: { hasPendingWrites: boolean } }) => void),
  unsubscribe: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: mocks.user }) }));
vi.mock("@/lib/firebase", () => ({
  auth: {
    get currentUser() {
      return mocks.currentUser;
    },
  },
  db: {},
}));
vi.mock("firebase/auth", () => ({ updateProfile: mocks.updateProfile }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => path.join("/"),
  onSnapshot: (_path: unknown, _options: unknown, callback: typeof mocks.listener) => {
    mocks.listener = (snapshot) =>
      callback?.({ ...snapshot, metadata: snapshot.metadata ?? { hasPendingWrites: false } });
    return mocks.unsubscribe;
  },
}));
import { useProfilePhoto } from "@/hooks/use-profile-photo";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: "owner", photoURL: "https://example.test/google.jpg" };
  mocks.currentUser = { uid: "owner", photoURL: "https://example.test/google.jpg" };
  mocks.updateProfile.mockResolvedValue(undefined);
});
afterEach(cleanup);
it("shows remote Firestore changes immediately and mirrors the saved photo to Auth", () => {
  const { result } = renderHook(useProfilePhoto);
  act(() =>
    mocks.listener?.({
      data: () => ({ photoURL: "https://firebasestorage.googleapis.com/new-avatar" }),
    }),
  );
  expect(result.current.photoURL).toContain("new-avatar");
  expect(mocks.updateProfile).toHaveBeenCalledWith(mocks.currentUser, {
    photoURL: "https://firebasestorage.googleapis.com/new-avatar",
  });
});
it("a removed photo stays empty instead of reviving a Google photo", () => {
  const { result } = renderHook(useProfilePhoto);
  act(() => mocks.listener?.({ data: () => ({ photoURL: "" }) }));
  expect(result.current.photoURL).toBe("");
  expect(mocks.updateProfile).toHaveBeenCalledWith(mocks.currentUser, { photoURL: "" });
});
it("retries Auth synchronization on reconnect and unsubscribes on account change", () => {
  const { result, rerender, unmount } = renderHook(useProfilePhoto);
  act(() => mocks.listener?.({ data: () => ({ photoURL: "https://example.test/saved.jpg" }) }));
  mocks.updateProfile.mockClear();
  act(() => window.dispatchEvent(new Event("online")));
  expect(mocks.updateProfile).toHaveBeenCalledOnce();
  mocks.user = { id: "other", photoURL: "" };
  rerender();
  expect(result.current.photoURL).toBe("");
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  mocks.user = null;
  rerender();
  expect(result.current.photoURL).toBe("");
  unmount();
});

it("does not mirror an uncommitted Firestore write to Auth", () => {
  const { result } = renderHook(useProfilePhoto);
  act(() =>
    mocks.listener?.({
      data: () => ({ photoURL: "https://example.test/uncommitted.jpg" }),
      metadata: { hasPendingWrites: true },
    }),
  );
  expect(result.current.photoURL).toBe("https://example.test/google.jpg");
  expect(mocks.updateProfile).not.toHaveBeenCalled();
});
