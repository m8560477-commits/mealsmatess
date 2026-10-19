import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function ensureUserProfile(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}) {
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);
  // Returning users may have custom profile choices and server-managed fields.
  if (snapshot.exists()) return;

  await setDoc(
    userRef,
    {
      id: user.uid,
      email: user.email ?? "",
      displayName: user.displayName || user.email?.split("@")[0] || "Chef",
      photoURL: user.photoURL ?? "",
      goal: "healthy_cooking",
      createdAt: new Date().toISOString(),
    },
    { merge: true },
  );
}
