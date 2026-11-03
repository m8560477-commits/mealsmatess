import { getFirebaseAdminFirestore } from "@/server/firebase-admin";

/** Read only the authenticated user's own profile and pantry. */
export async function loadMiaContext(userId: string, includePantry: boolean) {
  const user = getFirebaseAdminFirestore().collection("users").doc(userId);
  const [profile, pantry] = await Promise.all([
    user.get(),
    includePantry ? user.collection("pantry").where("user_id", "==", userId).limit(60).get() : null,
  ]);
  return {
    profile: profile.exists
      ? ({ id: profile.id, ...profile.data() } as Record<string, unknown>)
      : null,
    pantry: (pantry?.docs ?? []).map((entry) => {
      const item = entry.data();
      return {
        name: String(item.name ?? "").slice(0, 120),
        quantity: String(item.quantity ?? "").slice(0, 60),
      };
    }),
  };
}
