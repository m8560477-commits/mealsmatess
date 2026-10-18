import { getFirebaseServerServices } from "@/server/firebase-admin";

/** Trusted Firebase UIDs only; never client emails or profile flags. */
export async function isTrustedAdmin(userId: string): Promise<boolean> {
  if (!userId) return false;
  const { auth, db } = getFirebaseServerServices();
  const user = await auth.getUser(userId);
  if (user.disabled || !user.emailVerified) return false;
  const bootstrap = (process.env["MEALMATE_ADMIN_UIDS"] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (bootstrap.includes(userId)) return true;
  const roles = await db
    .collection("user_roles")
    .where("user_id", "==", userId)
    .where("role", "==", "admin")
    .limit(1)
    .get();
  return !roles.empty;
}

export async function requireAdmin(userId: string) {
  if (!(await isTrustedAdmin(userId))) throw new Response("Forbidden", { status: 403 });
}
