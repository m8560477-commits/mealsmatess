import { useCallback, useSyncExternalStore } from "react";
import { onSnapshot, doc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useSession } from "@/hooks/use-session";

type PhotoStore = { url: string | undefined; listeners: Set<() => void>; stop?: () => void };
const stores = new Map<string, PhotoStore>();
function start(uid: string, store: PhotoStore) {
  let active = true;
  const syncAuth = () => {
    const current = auth.currentUser;
    if (
      active &&
      store.url !== undefined &&
      current?.uid === uid &&
      (current.photoURL || "") !== store.url
    )
      void updateProfile(current, { photoURL: store.url }).catch(() => undefined);
  };
  const stop = onSnapshot(
    doc(db, "users", uid),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!active || snapshot.metadata.hasPendingWrites) return;
      const data = snapshot.data();
      if (data && typeof data.photoURL === "string") {
        const changed = store.url !== data.photoURL;
        store.url = data.photoURL;
        if (changed) store.listeners.forEach((notify) => notify());
        syncAuth();
      }
    },
    () => {
      /* Keep the last confirmed photo during network interruptions. */
    },
  );
  window.addEventListener("online", syncAuth);
  window.addEventListener("focus", syncAuth);
  return () => {
    active = false;
    stop();
    window.removeEventListener("online", syncAuth);
    window.removeEventListener("focus", syncAuth);
  };
}
/** One live user-document subscription shared by all avatars; released on final unmount. */
export function useProfilePhoto() {
  const { user } = useSession();
  const uid = user?.id;
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!uid) return () => {};
      let store = stores.get(uid);
      if (!store) {
        store = { url: undefined, listeners: new Set() };
        stores.set(uid, store);
      }
      store.listeners.add(notify);
      if (store.listeners.size === 1) store.stop = start(uid, store);
      return () => {
        store.listeners.delete(notify);
        if (!store.listeners.size) {
          store.stop?.();
          stores.delete(uid);
        }
      };
    },
    [uid],
  );
  const photoURL = useSyncExternalStore(
    subscribe,
    () => (uid ? stores.get(uid)?.url : undefined),
    () => undefined,
  );
  return { uid, photoURL: photoURL ?? user?.photoURL ?? "" };
}
