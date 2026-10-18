import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { normalizePreferences, type FoodPreferences } from "@/lib/preferences";
import { PreferencesSchema } from "@/lib/onboarding-model";
import { getFirebaseServerServices } from "@/server/firebase-admin";

export const getMyPreferences = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<FoodPreferences> => {
    const { db, auth } = getFirebaseServerServices();
    const profile = (await db.collection("users").doc(context.userId).get()).data();
    const user = await auth.getUser(context.userId);
    return normalizePreferences({
      display_name: profile?.display_name ?? profile?.displayName ?? user.displayName ?? "",
      allergies: profile?.allergies ?? [],
      dietary_restrictions: profile?.dietary_preferences ?? [],
      ...(profile?.preferences ?? {}),
      onboarding_completed: profile?.onboarding_completed === true,
    });
  });
export const saveMyPreferences = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((raw: unknown) => PreferencesSchema.partial().parse(raw))
  .handler(async ({ context, data }) => {
    const { db } = getFirebaseServerServices();
    const ref = db.collection("users").doc(context.userId);
    return db.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data() ?? {};
      const preferences = normalizePreferences({
        display_name: current.display_name ?? current.displayName ?? "",
        allergies: current.allergies ?? [],
        dietary_restrictions: current.dietary_preferences ?? [],
        ...(current.preferences ?? {}),
        ...data,
        onboarding_completed: current.onboarding_completed === true,
        updated_at: new Date().toISOString(),
      });
      tx.set(
        ref,
        {
          id: context.userId,
          preferences,
          display_name: preferences.display_name,
          locale: preferences.language,
          currency: preferences.budget_currency,
        },
        { merge: true },
      );
      return preferences;
    });
  });
