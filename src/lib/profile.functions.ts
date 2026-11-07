import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { loadFirebaseAdmin } from "@/lib/firebase-admin-access";

export const getCookingDashboard = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
    const db = getFirebaseAdminFirestore();
    const account = db.collection("users").doc(context.userId);
    const [profile, details, recipes, favorites, plans] = await Promise.all([
      account.get(),
      db.collection("profile_details").doc(context.userId).get(),
      db.collection("recipes").where("created_by", "==", context.userId).count().get(),
      account.collection("favorites").count().get(),
      account.collection("mealPlans").count().get(),
    ]);
    const data = profile.data();
    return {
      displayName: String(data?.displayName ?? ""),
      username: String(details.data()?.username ?? ""),
      photoURL: String(data?.photoURL ?? ""),
      recipes: recipes.data().count,
      favorites: favorites.data().count,
      plans: plans.data().count,
    };
  });
export const saveCookingProfile = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((value: unknown) =>
    z
      .object({
        displayName: z.string().trim().min(1).max(100),
        username: z
          .string()
          .trim()
          .regex(/^[a-zA-Z0-9_]{3,30}$/),
      })
      .parse(value),
  )
  .handler(async ({ context, data }) => {
    const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
    const db = getFirebaseAdminFirestore();
    const batch = db.batch();
    batch.set(
      db.collection("users").doc(context.userId),
      { displayName: data.displayName },
      { merge: true },
    );
    batch.set(
      db.collection("profile_details").doc(context.userId),
      { username: data.username },
      { merge: true },
    );
    await batch.commit();
    return true;
  });

export const getCookingHistory = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
    const db = getFirebaseAdminFirestore();
    // Query ownership first; never return other users' telemetry or error details.
    const [cooking, scans] = await Promise.all([
      db
        .collection("xp_events")
        .where("user_id", "==", context.userId)
        .where("action", "==", "recipe_cooked")
        .orderBy("created_at", "desc")
        .limit(100)
        .get(),
      db
        .collection("telemetry_events")
        .where("user_id", "==", context.userId)
        .where("kind", "==", "scan")
        .orderBy("created_at", "desc")
        .limit(100)
        .get(),
    ]);
    const cooked = cooking.docs
      .filter((doc) => doc.data().action === "recipe_cooked")
      .map((doc) => ({
        id: doc.id,
        label: "Recipe cooked",
        date: String(doc.data().created_at ?? ""),
      }));
    const scanned = scans.docs
      .filter((doc) => doc.data().kind === "scan" && doc.data().success === true)
      .map((doc) => ({
        id: doc.id,
        label: doc.data().name === "scan.dish" ? "Dish scan" : "Ingredient scan",
        date: String(doc.data().created_at ?? ""),
      }));
    const recent = (items: typeof cooked) =>
      items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
    return { cooking: recent(cooked), scans: recent(scanned) };
  });
