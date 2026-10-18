import { app } from "@/lib/firebase";

export async function requestBrowserPushToken(): Promise<string> {
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
  return token;
}

export async function revokeBrowserPushToken(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const { deleteToken, getMessaging, isSupported } = await import("firebase/messaging");
  if (!(await isSupported())) return;
  await deleteToken(getMessaging(app));
}

export async function listenForForegroundPush(
  onNotification: (notification: { title: string; body: string }) => void,
): Promise<() => void> {
  if (typeof window === "undefined") return () => undefined;
  const { getMessaging, isSupported, onMessage } = await import("firebase/messaging");
  if (!(await isSupported())) return () => undefined;
  return onMessage(getMessaging(app), (payload) => {
    const title = payload.notification?.title;
    if (title) onNotification({ title, body: payload.notification?.body ?? "" });
  });
}
