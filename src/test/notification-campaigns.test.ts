import { beforeEach, expect, it, vi } from "vitest";
import { firestoreFixture } from "./firestore-fixture";
import {
  saveAnnouncement,
  cancelScheduledAnnouncement,
  processAnnouncementBatch,
} from "@/server/notification-delivery";
const mocks = vi.hoisted(() => ({ db: null as any, send: vi.fn(), user: vi.fn() }));
vi.mock("@/server/firebase-admin", () => ({
  getFirebaseAdminFirestore: () => mocks.db,
  getFirebaseAdminAuth: () => ({ getUser: mocks.user, getUserByEmail: mocks.user }),
}));
vi.mock("@/server/user-notifications", () => ({ deliverPendingNotifications: mocks.send }));
let fixture: ReturnType<typeof firestoreFixture>;
beforeEach(() => {
  fixture = firestoreFixture();
  mocks.db = fixture.db;
  vi.clearAllMocks();
});
const input = {
  title: "Synthetic campaign",
  body: "For automated testing only",
  imageUrl: null,
  category: "general" as const,
  audience: "all_consumers" as const,
  destination: "/" as const,
  scheduledAt: "2099-01-01T00:00:00.000Z",
  status: "scheduled" as const,
};
it("does not send a future scheduled campaign and supports edit/cancel", async () => {
  const saved = await saveAnnouncement(input, "admin");
  expect(await processAnnouncementBatch(saved.id, { allowImmediate: false })).toMatchObject({
    claimed: false,
  });
  await saveAnnouncement({ ...input, id: saved.id, title: "Edited campaign" }, "admin");
  expect(await cancelScheduledAnnouncement(saved.id)).toEqual({ cancelled: true });
  expect(await processAnnouncementBatch(saved.id, { allowImmediate: true })).toMatchObject({
    claimed: false,
  });
  expect(mocks.send).not.toHaveBeenCalled();
});
it("records an empty audience and prevents repeat processing", async () => {
  const saved = await saveAnnouncement({ ...input, status: "draft", scheduledAt: null }, "admin");
  expect(await processAnnouncementBatch(saved.id, { allowImmediate: true })).toMatchObject({
    status: "published",
    recipientCount: 0,
    push: { accepted: 0 },
  });
  expect(await processAnnouncementBatch(saved.id, { allowImmediate: true })).toMatchObject({
    claimed: false,
  });
  expect(mocks.send).not.toHaveBeenCalled();
});

it("ignores unknown selected accounts while retaining valid trimmed identities", async () => {
  mocks.user.mockImplementation(async (value: string) => {
    if (value === "missing@example.test") throw { code: "auth/user-not-found" };
    return { uid: "valid", disabled: false };
  });
  const saved = await saveAnnouncement(
    {
      ...input,
      audience: "selected",
      selectedUsers: ["  ", " missing@example.test ", " valid@example.test "],
    },
    "admin",
  );
  expect(fixture.records.get(`admin_announcements/${saved.id}`)?.selectedUserIds).toEqual([
    "valid",
  ]);
});
