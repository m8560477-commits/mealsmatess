import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { getFirebaseServerServices } from "@/server/firebase-admin";
import { assertRequiredAnswers } from "@/lib/onboarding-model";
import { normalizePreferences, preferenceScore, preferenceSummary } from "@/lib/preferences";
import { recipeMatchesDiet, conflictsWithText } from "@/lib/recipe-safety";
import { recipeCatalogRecord } from "@/lib/recipe-catalog";
import { generateAiObject, deduplicateAiRequest } from "@/lib/ai-engine.server";
import { enforceRateLimit } from "@/lib/security.server";
import { callModel, toDbRecipe } from "@/lib/recipe-generation.server";
import { resolveEntitlement } from "@/lib/entitlements.server";

const SummarySchema = z.object({
  greeting: z.string().min(1).max(500),
  explanations: z.array(z.string().min(1).max(300)).length(3),
  prompts: z.array(z.string().min(1).max(160)).length(3),
  shoppingTips: z.array(z.string().min(1).max(300)).max(4),
});
function fingerprint(prefs: ReturnType<typeof normalizePreferences>) {
  const {
    updated_at: _time,
    onboarding_step: _step,
    onboarding_completed: _done,
    ...answers
  } = prefs;
  return createHash("sha256").update(JSON.stringify(answers)).digest("hex");
}
export const getOnboardingExperience = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { db } = getFirebaseServerServices();
    const doc = await db.collection("onboarding_experiences").doc(context.userId).get();
    const profile = (await db.collection("users").doc(context.userId).get()).data();
    const result = doc.exists ? (doc.data() as OnboardingExperience) : null;
    return result?.fingerprint === fingerprint(normalizePreferences(profile?.preferences))
      ? result
      : null;
  });
export type OnboardingExperience = {
  fingerprint: string;
  greeting: string;
  prompts: string[];
  shoppingTips: string[];
  recipes: NonNullable<ReturnType<typeof recipeCatalogRecord>>[];
  explanations: string[];
  categories: string[];
  plan: { day: number; meal: string; recipeId: string; name: string; slug: string }[];
  createdAt: string;
};
export const createOnboardingExperience = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<OnboardingExperience> => {
    const { db, auth } = getFirebaseServerServices();
    const user = await auth.getUser(context.userId);
    if (!user.emailVerified || user.disabled)
      throw new Error("Verify your email before creating your experience.");
    const profile = (await db.collection("users").doc(context.userId).get()).data();
    const prefs = normalizePreferences(profile?.preferences);
    assertRequiredAnswers(prefs);
    const key = fingerprint(prefs);
    return deduplicateAiRequest(`${context.userId}:onboarding:${key}`, async () => {
      const ref = db.collection("onboarding_experiences").doc(context.userId);
      const prior = (await ref.get()).data() as OnboardingExperience | undefined;
      if (prior?.fingerprint === key) return prior;
      await enforceRateLimit("onboarding", context.userId, 3);
      const usageRef = db.collection("onboarding_generation_usage").doc(context.userId);
      await db.runTransaction(async (tx) => {
        const usage = (await tx.get(usageRef)).data();
        const day = new Date().toISOString().slice(0, 10);
        const count = usage?.day === day ? Number(usage.count) : 0;
        if (count >= 3)
          throw new Error(
            "You've created three experiences today. Your answers are saved. Try again tomorrow.",
          );
        tx.set(usageRef, { day, count: count + 1 });
      });
      const rows = await db.collection("recipes").get();
      const candidates = rows.docs
        .map((doc) => recipeCatalogRecord({ ...doc.data(), id: doc.id }))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .filter((r) => recipeMatchesDiet(prefs, r));
      const maxTime =
        prefs.cooking_time === "Under 15 minutes"
          ? 15
          : prefs.cooking_time === "15–30 minutes"
            ? 30
            : prefs.cooking_time === "30–60 minutes"
              ? 60
              : Infinity;
      const ranked = candidates
        .map((r) => ({
          r,
          score:
            preferenceScore(prefs, r.name, r.cuisine, r.category) +
            ((r.cooking_time_minutes ?? Infinity) <= maxTime ? 4 : 0) +
            (prefs.cooking_level === "Beginner" && /easy|beginner/i.test(r.difficulty ?? "")
              ? 4
              : 0) +
            (prefs.country === "ZA" && /south african|cape malay/i.test(`${r.cuisine} ${r.country}`)
              ? 3
              : 0),
        }))
        .sort((a, b) => b.score - a.score);
      const recipes = ranked.slice(0, 3).map(({ r }) => r);
      while (recipes.length < 3) {
        const recipe = await callModel(
          `Create one practical starter recipe for this user: ${preferenceSummary(prefs)}. Respect all allergies, restrictions, household servings, budget, cooking skill and time. Exclude these already selected dishes: ${recipes.map((r) => r.name).join(", ")}.`,
        );
        if (!recipeMatchesDiet(prefs, recipe))
          throw new Error(
            "A starter recipe conflicted with your dietary requirements. Your progress is saved; please retry.",
          );
        const ref = db.collection("recipes").doc();
        const row = {
          ...toDbRecipe(recipe, context.userId),
          id: ref.id,
          created_at: new Date().toISOString(),
        };
        await ref.set(row);
        const record = recipeCatalogRecord(row);
        if (!record) throw new Error("Could not prepare the starter recipe.");
        recipes.push(record);
      }
      const summary = await generateAiObject({
        feature: "onboarding.personalize",
        instructions:
          "You are Mia, MealMate's friendly food assistant. Use only the supplied recipe facts and actual preferences. Explain compromises honestly (including cooking time or budget). Never claim to have priced groceries, scheduled reminders, started a trial, or changed a meal plan. Do not recommend or repeat the names of ingredients conflicting with allergies, restrictions or dislikes, even in avoidance statements. Give shopping suggestions only when a budget amount is supplied; otherwise return an empty shoppingTips array. Respond in the preferred language.",
        prompt: JSON.stringify({
          userName: prefs.display_name,
          preferences: preferenceSummary(prefs),
          budget: prefs.budget_amount,
          recipes,
        }),
        schema: SummarySchema,
      });
      if (
        [
          summary.greeting,
          ...summary.prompts,
          ...summary.shoppingTips,
          ...summary.explanations,
        ].some((text) => conflictsWithText(prefs, text))
      )
        throw new Error(
          "Mia's suggestions could not be verified against your dietary requirements. Your answers are saved; please retry.",
        );
      const meals = prefs.meal_types.length ? prefs.meal_types : ["Dinner"];
      const days = prefs.planning_style === "week" ? 7 : 1;
      const result: OnboardingExperience = {
        ...summary,
        fingerprint: key,
        recipes,
        categories: [...new Set(recipes.map((r) => r.category || r.cuisine || "Recommended"))],
        plan: Array.from({ length: days }, (_, day) =>
          meals.map((meal, i) => {
            const matching = recipes.filter((r) =>
              `${r.meal_type} ${r.category}`
                .toLowerCase()
                .includes(meal.toLowerCase().replace(/s$/, "")),
            );
            const recipe = (matching.length ? matching : recipes)[
              (day + i) % (matching.length || recipes.length)
            ]!;
            return {
              day: day + 1,
              meal,
              recipeId: recipe.id,
              name: recipe.name,
              slug: recipe.slug,
            };
          }),
        ).flat(),
        createdAt: new Date().toISOString(),
      };
      await ref.set(result);
      return result;
    });
  });
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { db } = getFirebaseServerServices();
    if (!(await resolveEntitlement(context.userId)).isPremium)
      throw new Error(
        "Choose a subscription, restore an existing purchase, or activate complimentary access to continue.",
      );
    const ref = db.collection("users").doc(context.userId);
    await db.runTransaction(async (tx) => {
      const profile = (await tx.get(ref)).data();
      const prefs = normalizePreferences(profile?.preferences);
      assertRequiredAnswers(prefs);
      const experience = (
        await tx.get(db.collection("onboarding_experiences").doc(context.userId))
      ).data();
      if (
        prefs.onboarding_step < 11 ||
        !experience ||
        experience.fingerprint !== fingerprint(prefs)
      )
        throw new Error("Finish your personalized preview before completing onboarding.");
      tx.set(
        ref,
        {
          onboarding_completed: true,
          preferences: {
            ...prefs,
            onboarding_completed: true,
            onboarding_step: 11,
            updated_at: new Date().toISOString(),
          },
        },
        { merge: true },
      );
    });
    return { ok: true };
  });
