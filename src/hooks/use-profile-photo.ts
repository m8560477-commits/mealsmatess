import { useEffect, useState } from "react";
import { onSnapshot, doc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useSession } from "@/hooks/use-session";

export function useProfilePhoto() {
  const { user } = useSession();
  const uid = user?.id;
  const [profile, setProfile] = useState<{ uid: string; url: string } | null>(null);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    let latest: string | undefined;
    const syncAuth = () => {
      const current = auth.currentUser;
      if (
        active &&
        latest !== undefined &&
        current?.uid === uid &&
        (current.photoURL || "") !== latest
      )
        void updateProfile(current, { photoURL: latest }).catch(() => undefined);
    };
    const stop = onSnapshot(
      doc(db, "users", uid),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;
        const data = snapshot.data();
        if (data && typeof data.photoURL === "string") {
          latest = data.photoURL;
          setProfile({ uid, url: latest });
          syncAuth();
        }
      },
      () => {
        /* Retain the last confirmed image during network interruptions. */
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
  }, [uid]);
  return { uid, photoURL: profile && profile.uid === uid ? profile.url : user?.photoURL || "" };
}
