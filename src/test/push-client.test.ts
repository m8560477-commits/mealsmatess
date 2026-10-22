import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  request: vi.fn(),
  channel: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  removeDelivered: vi.fn(),
  listeners: new Map<string, (v: any) => void>(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "android" } }));
vi.mock("@/lib/firebase", () => ({ app: {}, auth: { currentUser: { uid: "test" } } }));
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    checkPermissions: mocks.permission,
    requestPermissions: mocks.request,
    createChannel: mocks.channel,
    register: mocks.register,
    unregister: mocks.unregister,
    removeAllDeliveredNotifications: mocks.removeDelivered,
    addListener: async (name: string, callback: (v: any) => void) => {
      mocks.listeners.set(name, callback);
      return { remove: async () => mocks.listeners.delete(name) };
    },
  },
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.listeners.clear();
  mocks.permission.mockResolvedValue({ receive: "prompt" });
  mocks.request.mockResolvedValue({ receive: "granted" });
  mocks.register.mockImplementation(async () =>
    mocks.listeners.get("registration")?.({ value: "synthetic-native-token" }),
  );
});
it("requests Android permission and registers native channels and tokens", async () => {
  const client = await import("@/lib/push-client");
  expect(await client.requestBrowserPushToken()).toBe("synthetic-native-token");
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.channel).toHaveBeenCalledTimes(4);
  await client.revokeBrowserPushToken();
  expect(mocks.unregister).toHaveBeenCalledOnce();
});
it("explains system settings on denied permission without registering", async () => {
  mocks.request.mockResolvedValue({ receive: "denied" });
  const client = await import("@/lib/push-client");
  await expect(client.requestBrowserPushToken()).rejects.toThrow(/Android Settings/);
  expect(mocks.register).not.toHaveBeenCalled();
});
it("forwards foreground notifications and releases listeners", async () => {
  const client = await import("@/lib/push-client");
  const callback = vi.fn();
  const stop = await client.listenForForegroundPush(callback);
  mocks.listeners.get("pushNotificationReceived")?.({ title: "MealMate", body: "An update" });
  expect(callback).toHaveBeenCalledWith({ title: "MealMate", body: "An update" });
  stop();
  expect(mocks.listeners.has("pushNotificationReceived")).toBe(false);
});
