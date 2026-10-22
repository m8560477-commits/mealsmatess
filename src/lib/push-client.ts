import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { safeNotificationDestination } from "@/lib/notification-policy";
import { app, auth } from "@/lib/firebase";

let activeToken: string | null = null;
let registration: Promise<string> | null = null;

async function nativeToken(requestPermission: boolean): Promise<string> {
  if (registration) return registration;
  registration = (async () => {
    let permission = await PushNotifications.checkPermissions();
    if (requestPermission && permission.receive !== "granted")
      permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted")
      throw new Error(
        "Notifications are disabled. Open Android Settings → Apps → MealMate → Notifications to enable them.",
      );
    for (const [id, name] of [
      ["meal_planning", "Meal Planning"],
      ["recipes", "Recipes"],
      ["dining", "Dining"],
      ["account", "Account"],
    ]) {
      await PushNotifications.createChannel({ id, name, importance: 3, visibility: 0 });
    }
    return new Promise<string>((resolve, reject) => {
      const handles: PluginListenerHandle[] = [];
      let settled = false;
      const finish = (error?: Error, token?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        handles.forEach((handle) => void handle.remove());
        if (error) reject(error);
        else {
          activeToken = token!;
          resolve(token!);
        }
      };
      const timer = setTimeout(
        () =>
          finish(
            new Error(
              "Device registration timed out. Check your connection and Firebase configuration.",
            ),
          ),
        20_000,
      );
      void (async () => {
        handles.push(
          await PushNotifications.addListener("registration", (token) =>
            finish(undefined, token.value),
          ),
        );
        handles.push(
          await PushNotifications.addListener("registrationError", () =>
            finish(
              new Error(
                "Android push registration failed. Check Firebase configuration and try again.",
              ),
            ),
          ),
        );
        if (settled) {
          handles.forEach((h) => void h.remove());
          return;
        }
        await PushNotifications.register();
      })().catch(() => finish(new Error("Could not register Android notifications.")));
    });
  })().finally(() => {
    registration = null;
  });
  return registration;
}

export async function requestBrowserPushToken(): Promise<string> {
  if (Capacitor.getPlatform() === "android") return nativeToken(true);
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator)
  ) {
    throw new Error("Push notifications are not supported in this browser.");
  }
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new Error("Web Push is not configured for this app yet.");

  const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
  if (!(await isSupported()))
    throw new Error("Push notifications are not supported in this browser.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Allow notifications in your browser to enable push.");

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const token = await getToken(getMessaging(app), {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error("Firebase did not return a push token for this device.");
  activeToken = token;
  return token;
}

export async function revokeBrowserPushToken(): Promise<void> {
  activeToken = null;
  if (Capacitor.getPlatform() === "android") {
    await PushNotifications.removeAllDeliveredNotifications();
    await PushNotifications.unregister();
    return;
  }
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const { deleteToken, getMessaging, isSupported } = await import("firebase/messaging");
  if (!(await isSupported())) return;
  await deleteToken(getMessaging(app));
}

export async function listenForForegroundPush(
  onNotification: (notification: { title: string; body: string }) => void,
): Promise<() => void> {
  if (typeof window === "undefined") return () => undefined;
  if (Capacitor.getPlatform() === "android") {
    const handle = await PushNotifications.addListener("pushNotificationReceived", (payload) =>
      onNotification({ title: payload.title ?? "MealMate", body: payload.body ?? "New update" }),
    );
    return () => {
      void handle.remove();
    };
  }
  const { getMessaging, isSupported, onMessage } = await import("firebase/messaging");
  if (!(await isSupported())) return () => undefined;
  return onMessage(getMessaging(app), (payload) => {
    const title = payload.notification?.title;
    if (title) onNotification({ title, body: payload.notification?.body ?? "" });
  });
}

export async function initializePushSession(
  userId: string,
  onTap: (destination: ReturnType<typeof safeNotificationDestination>) => void,
) {
  const { auth } = await import("@/lib/firebase");
  const { getMyNotificationPreferences, registerMyPushToken } =
    await import("@/lib/notifications.functions");
  const handles: PluginListenerHandle[] = [];
  let active = true;
  const save = async (token: string) => {
    if (!active || auth.currentUser?.uid !== userId) return;
    activeToken = token;
    await registerMyPushToken({ data: { token } });
  };
  if (Capacitor.getPlatform() === "android") {
    handles.push(
      await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        if (active && auth.currentUser?.uid === userId)
          onTap(safeNotificationDestination(action.notification.data?.destination));
      }),
    );
    handles.push(
      await PushNotifications.addListener("registration", (token) => {
        void save(token.value).catch(() => undefined);
      }),
    );
  }
  const refresh = async () => {
    if (!active || auth.currentUser?.uid !== userId) return;
    const p = await getMyNotificationPreferences();
    if (!p.pushEnabled || !active) return;
    if (Capacitor.getPlatform() === "android") await save(await nativeToken(false));
    else if (typeof Notification !== "undefined" && Notification.permission === "granted")
      await save(await requestBrowserPushToken());
  };
  const visible = () => {
    if (document.visibilityState === "visible") void refresh().catch(() => undefined);
  };
  document.addEventListener("visibilitychange", visible);
  void refresh().catch(() => undefined);
  return () => {
    active = false;
    document.removeEventListener("visibilitychange", visible);
    handles.forEach((h) => void h.remove());
  };
}

export async function disconnectPushDevice() {
  const ownerAtLogout = auth.currentUser?.uid;
  const { unregisterMyPushToken } = await import("@/lib/notifications.functions");
  try {
    if (activeToken) await unregisterMyPushToken({ data: { token: activeToken } });
  } finally {
    if (auth.currentUser?.uid === ownerAtLogout) await revokeBrowserPushToken();
  }
}
