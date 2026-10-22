import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  save: vi.fn(),
  firestore: vi.fn(),
  uid: "ordinary-user",
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (v: unknown) => v;
    const builder = {
      middleware: () => builder,
      validator: (fn: typeof parse) => {
        parse = fn;
        return builder;
      },
      handler:
        (fn: (v: unknown) => unknown) =>
        (input: { data?: unknown } = {}) =>
          fn({ data: parse(input.data), context: { userId: mocks.uid } }),
    };
    return builder;
  },
}));
vi.mock("@/lib/firebase-auth-middleware", () => ({ requireFirebaseAuth: {} }));
vi.mock("@/lib/firebase-admin-access", () => ({
  loadFirebaseAdmin: async () => ({
    firebaseAdmin: {
      from: () => {
        const query = { select: () => query, eq: () => query, maybeSingle: mocks.role };
        return query;
      },
    },
    getFirebaseAdminFirestore: mocks.firestore,
  }),
}));
vi.mock("@/server/notification-delivery", () => ({ saveAnnouncement: mocks.save }));
import {
  saveAdminAnnouncement,
  publishAdminAnnouncement,
  cancelAdminAnnouncement,
  listAdminAnnouncements,
  previewAnnouncementAudience,
  retryAdminAnnouncement,
} from "@/lib/notifications.functions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ data: null, error: null });
});
it("checks server roles on every admin campaign action", async () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  for (const call of [
    () => listAdminAnnouncements(),
    () => publishAdminAnnouncement({ data: { id } }),
    () => cancelAdminAnnouncement({ data: { id } }),
    () => retryAdminAnnouncement({ data: { id } }),
    () => previewAnnouncementAudience({ data: { audience: "all_consumers", category: "general" } }),
    () =>
      saveAdminAnnouncement({
        data: {
          title: "Test",
          body: "Synthetic test",
          imageUrl: null,
          category: "general",
          audience: "all_consumers",
          destination: "/",
          scheduledAt: null,
          status: "draft",
        },
      }),
  ]) {
    await expect(call()).rejects.toMatchObject({ status: 403 });
  }
  expect(mocks.firestore).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("validates destinations before storage even for an admin", async () => {
  mocks.role.mockResolvedValue({ data: { role: "admin" } });
  await expect(async () =>
    saveAdminAnnouncement({
      data: {
        title: "Test",
        body: "Test",
        imageUrl: null,
        category: "general",
        audience: "all_consumers",
        destination: "https://evil.test" as "/",
        scheduledAt: null,
        status: "draft",
      },
    }),
  ).rejects.toThrow();
  expect(mocks.save).not.toHaveBeenCalled();
});

it("limits retry queries to failed or partially accepted campaign notifications", async () => {
  mocks.role.mockResolvedValue({ data: { role: "admin" } });
  const query = {
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ docs: [] }),
  };
  mocks.firestore.mockReturnValue({ collectionGroup: vi.fn().mockReturnValue(query) });
  const id = "123e4567-e89b-42d3-a456-426614174000";
  await expect(retryAdminAnnouncement({ data: { id } })).resolves.toEqual({ queued: 0 });
  expect(query.where).toHaveBeenCalledWith("announcementId", "==", id);
  expect(query.where).toHaveBeenCalledWith("pushStatus", "in", ["failed", "accepted"]);
});
