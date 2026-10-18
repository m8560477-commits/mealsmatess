import { aiProfile } from "@/lib/ai-profile";
import { preferenceSummary } from "@/lib/preferences";
import { createServerFn } from "@tanstack/react-start";
import { requireAiCredit } from "@/lib/ai-credits.server";
import { generateAiObject } from "@/lib/ai-engine.server";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { loadFirebaseAdmin } from "@/lib/firebase-admin-access";
import { enforceRateLimit, trackEvent } from "@/lib/security.server";

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

const PlanInput = z
  .object({
    days: z.number().int().min(1).max(14).default(7),
    meals: z
      .array(z.enum(MEAL_TYPES))
      .min(1)
      .max(MEAL_TYPES.length)
      .default(["Breakfast", "Lunch", "Dinner"]),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .superRefine(({ startDate }, context) => {
    if (!startDate) return;
    const parsed = new Date(`${startDate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== startDate) {
      context.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Use a real calendar date.",
      });
    }
  });

type MealSuggestion = {
  day: number;
  date: string;
  meal_type: string;
  name: string;
  calories: number;
  short_reason: string;
};

// AI Meal Planner v2 — uses profile (goal, allergies, budget, dietary_preferences)
export const generatePersonalizedPlan = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((v: unknown) => PlanInput.parse(v))
  .handler(async ({ data, context }) => {
    await requireAiCredit(context.userId);
    await enforceRateLimit("ai_planner", context.userId, 5);
    const { firebaseAdmin } = await loadFirebaseAdmin();

    const { data: savedProfile } = await firebaseAdmin
      .from("profiles")
      .select(
        "goal,activity_level,allergies,budget_per_day,dietary_preferences,family_size,weight_kg,height_cm,age,preferences",
      )
      .eq("id", context.userId)
      .maybeSingle();
    const profile = aiProfile(savedProfile);

    const start = data.startDate ? new Date(`${data.startDate}T00:00:00.000Z`) : new Date();
    start.setUTCHours(0, 0, 0, 0);
    const dates: string[] = [];
    for (let i = 0; i < data.days; i++) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + i);
      dates.push(date.toISOString().slice(0, 10));
    }

    const prompt = `Build a ${data.days}-day meal plan for meals: ${data.meals.join(", ")}.
User profile:
- Saved preferences: ${profile ? preferenceSummary(profile.preferences) : "none specified"}
- Goal: ${profile?.goal ?? "general wellness"}
- Activity: ${profile?.activity_level ?? "moderate"}
- Allergies: ${(profile?.allergies ?? []).join(", ") || "none"}
- Dietary preferences: ${(profile?.dietary_preferences ?? []).join(", ") || "none"}
- Daily budget: ${profile?.budget_per_day ? `$${profile.budget_per_day}` : "flexible"}
- Family size: ${profile?.family_size ?? 1}

Prefer varied, culturally diverse dishes including South African options. Reply ONLY as JSON:
{"plan":[{"day":1,"meal_type":"Breakfast","name":"...","calories":450,"short_reason":"..."}]}
Days: 1..${data.days}. One entry per meal per day.`;

    const t0 = Date.now();
    try {
      const parsed = await generateAiObject({
        feature: "planner.generate",
        instructions:
          "You are a chef and nutrition coach. Return valid, culturally varied meals and clearly estimated calories. Never include a listed allergen or violate a dietary preference.",
        prompt,
        schema: z.object({
          plan: z
            .array(
              z.object({
                day: z.number().int().min(1).max(data.days),
                meal_type: z.enum(MEAL_TYPES),
                name: z.string().trim().min(1).max(160),
                calories: z.number().int().min(0).max(10000).default(0),
                short_reason: z.string().max(240).default(""),
              }),
            )
            .length(data.days * data.meals.length)
            .superRefine((plan, context) => {
              const seen = new Set<string>();
              for (const [index, meal] of plan.entries()) {
                const key = `${meal.day}:${meal.meal_type}`;
                if (!data.meals.includes(meal.meal_type)) {
                  context.addIssue({
                    code: "custom",
                    path: [index, "meal_type"],
                    message: "The plan contains a meal type that was not requested.",
                  });
                }
                if (seen.has(key)) {
                  context.addIssue({
                    code: "custom",
                    path: [index],
                    message: "The plan contains a duplicate day and meal type.",
                  });
                }
                seen.add(key);
              }
            }),
        }),
      });
      const suggestions: MealSuggestion[] = parsed.plan.map((p) => ({
        day: p.day,
        date: dates[Math.max(0, Math.min(p.day - 1, dates.length - 1))] ?? dates[0] ?? "",
        meal_type: p.meal_type,
        name: p.name,
        calories: p.calories ?? 0,
        short_reason: p.short_reason ?? "",
      }));
      void trackEvent({
        user_id: context.userId,
        kind: "ai",
        name: "ai.plan_generated",
        latency_ms: Date.now() - t0,
        success: true,
        metadata: { days: data.days, count: suggestions.length },
      });
      return { suggestions };
    } catch (err) {
      void trackEvent({
        user_id: context.userId,
        kind: "ai",
        name: "ai.plan_generated",
        latency_ms: Date.now() - t0,
        success: false,
        error: err instanceof Error ? err.message.slice(0, 500) : String(err),
      });
      throw err;
    }
  });

// Auto-generate grocery list from planned meals in a date range
export const buildGroceryFromPlan = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((v: unknown) => z.object({ from: z.string(), to: z.string() }).parse(v))
  .handler(async ({ data, context }) => {
    const firebase = context.firebase;
    const { data: plans, error } = await firebase
      .from("meal_plans")
      .select("recipe_id, recipes(ingredients, name)")
      .gte("plan_date", data.from)
      .lte("plan_date", data.to);
    if (error) throw new Error(error.message);

    // aggregate ingredients by name
    const map = new Map<string, { quantity: string | null; sources: Set<string> }>();
    for (const p of plans ?? []) {
      const rec = (p as { recipes?: { ingredients?: unknown; name?: string } | null }).recipes;
      const ings = Array.isArray(rec?.ingredients)
        ? (rec!.ingredients as Array<{ name?: string; quantity?: string }>)
        : [];
      for (const ing of ings) {
        if (!ing?.name) continue;
        const k = ing.name.trim().toLowerCase();
        const cur = map.get(k) ?? { quantity: null, sources: new Set() };
        if (ing.quantity)
          cur.quantity = cur.quantity ? `${cur.quantity} + ${ing.quantity}` : ing.quantity;
        if (rec?.name) cur.sources.add(rec.name);
        map.set(k, cur);
      }
    }

    const rows = Array.from(map.entries()).map(([name, v]) => ({
      user_id: context.userId,
      name,
      quantity: v.quantity,
      category: Array.from(v.sources).slice(0, 3).join(", ") || null,
    }));

    if (rows.length === 0) return { inserted: 0 };
    const { error: insErr } = await firebase.from("grocery_items").insert(rows);
    if (insErr) throw new Error(insErr.message);
    void trackEvent({
      user_id: context.userId,
      kind: "planner",
      name: "planner.autogrocery",
      success: true,
      metadata: { inserted: rows.length },
    });
    return { inserted: rows.length };
  });

// One-click: AI plan → persist meals → build aggregated grocery list.
const PlanAndShopInput = z.object({
  days: z.number().int().min(1).max(7).default(7),
  meals: z.array(z.string()).default(["Breakfast", "Lunch", "Dinner"]),
  startDate: z.string().optional(),
  replaceExisting: z.boolean().default(false),
});

type ShopItem = { name: string; quantity?: string; category?: string };
type ShopMeal = {
  day: number;
  meal_type: string;
  name: string;
  calories?: number;
  ingredients: ShopItem[];
};

export const aiPlanAndShop = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((v: unknown) => PlanAndShopInput.parse(v))
  .handler(async ({ data, context }) => {
    await requireAiCredit(context.userId);
    await enforceRateLimit("ai_planner", context.userId, 5);
    const { firebase, userId } = context;

    const { data: savedProfile } = await firebase
      .from("profiles")
      .select(
        "goal,activity_level,allergies,budget_per_day,dietary_preferences,family_size,weight_kg,height_cm,age,preferences",
      )
      .eq("id", userId)
      .maybeSingle();
    const profile = aiProfile(savedProfile);

    const start = data.startDate ? new Date(data.startDate) : new Date();
    const dates: string[] = [];
    for (let i = 0; i < data.days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const fromISO = dates[0] ?? data.startDate ?? new Date().toISOString().slice(0, 10);
    const toISO = dates.at(-1) ?? fromISO;

    const prompt = `Build a ${data.days}-day meal plan with meals: ${data.meals.join(", ")}.
Profile:
- Saved preferences: ${profile ? preferenceSummary(profile.preferences) : "none specified"}
- Goal: ${profile?.goal ?? "general wellness"}
- Activity: ${profile?.activity_level ?? "moderate"}
- Allergies (must avoid): ${(profile?.allergies ?? []).join(", ") || "none"}
- Dietary preferences: ${(profile?.dietary_preferences ?? []).join(", ") || "none"}
- Daily budget: ${profile?.budget_per_day ? `$${profile.budget_per_day}` : "flexible"}
- Family size: ${profile?.family_size ?? 1}

For EACH meal, include a compact ingredient list scaled for the family size.
Use short pantry-friendly names ("chicken breast", "olive oil", "spinach").
Group category as one of: Produce, Meat, Dairy, Pantry, Grains, Frozen, Bakery, Spices, Other.

Reply ONLY as strict JSON with this exact shape:
{"plan":[{"day":1,"meal_type":"Breakfast","name":"...","calories":450,"ingredients":[{"name":"eggs","quantity":"4","category":"Dairy"}]}]}
Days: 1..${data.days}. One entry per meal per day.`;

    const t0 = Date.now();
    let suggestions: ShopMeal[] = [];
    try {
      const parsed = await generateAiObject({
        feature: "planner.plan_and_shop",
        instructions:
          "You are a chef and nutrition coach. Return a varied, valid meal plan with estimated calories and practical grocery ingredients. Never include a listed allergen or violate a dietary preference.",
        prompt,
        schema: z.object({
          plan: z
            .array(
              z.object({
                day: z.number().int().min(1).max(data.days),
                meal_type: z.string().trim().min(1).max(50),
                name: z.string().trim().min(1).max(160),
                calories: z.number().int().min(0).max(10000).optional(),
                ingredients: z
                  .array(
                    z.object({
                      name: z.string().trim().min(1).max(120),
                      quantity: z.string().max(80).optional(),
                      category: z
                        .enum([
                          "Produce",
                          "Meat",
                          "Dairy",
                          "Pantry",
                          "Grains",
                          "Frozen",
                          "Bakery",
                          "Spices",
                          "Other",
                        ])
                        .optional(),
                    }),
                  )
                  .min(1)
                  .max(40),
              }),
            )
            .min(1)
            .max(data.days * Math.max(data.meals.length, 1)),
        }),
      });
      suggestions = parsed.plan;
    } catch (err) {
      void trackEvent({
        user_id: userId,
        kind: "ai",
        name: "ai.plan_and_shop",
        latency_ms: Date.now() - t0,
        success: false,
        error: err instanceof Error ? err.message.slice(0, 500) : String(err),
      });
      throw err;
    }

    // Persist meal_plans (as custom entries).
    if (data.replaceExisting) {
      await firebase.from("meal_plans").delete().gte("plan_date", fromISO).lte("plan_date", toISO);
    }

    const planRows = suggestions.map((m) => ({
      user_id: userId,
      plan_date: dates[Math.max(0, Math.min(m.day - 1, dates.length - 1))] ?? fromISO,
      meal_type: m.meal_type,
      custom_name: m.name,
      recipe_id: null as string | null,
    }));
    if (planRows.length > 0) {
      const { error: pErr } = await firebase.from("meal_plans").insert(planRows);
      if (pErr) throw new Error(pErr.message);
    }

    // Aggregate ingredients into grocery items.
    const map = new Map<
      string,
      { name: string; quantity: string | null; category: string | null }
    >();
    for (const m of suggestions) {
      for (const ing of m.ingredients ?? []) {
        if (!ing?.name) continue;
        const k = ing.name.trim().toLowerCase();
        const cur = map.get(k) ?? {
          name: ing.name.trim(),
          quantity: null,
          category: ing.category ?? null,
        };
        if (ing.quantity) {
          cur.quantity = cur.quantity ? `${cur.quantity} + ${ing.quantity}` : ing.quantity;
        }
        if (!cur.category && ing.category) cur.category = ing.category;
        map.set(k, cur);
      }
    }

    // Skip items the user already has unchecked in their list.
    const { data: existing } = await firebase
      .from("grocery_items")
      .select("name")
      .eq("checked", false);
    const have = new Set(
      ((existing ?? []) as { name: string }[]).map((r) => r.name.trim().toLowerCase()),
    );

    const rows = Array.from(map.entries())
      .filter(([k]) => !have.has(k))
      .map(([, v]) => ({
        user_id: userId,
        name: v.name,
        quantity: v.quantity,
        category: v.category,
      }));

    let inserted = 0;
    if (rows.length > 0) {
      const { error: gErr } = await firebase.from("grocery_items").insert(rows);
      if (gErr) throw new Error(gErr.message);
      inserted = rows.length;
    }

    void trackEvent({
      user_id: userId,
      kind: "planner",
      name: "ai.plan_and_shop",
      latency_ms: Date.now() - t0,
      success: true,
      metadata: { meals: planRows.length, groceries: inserted, days: data.days },
    });

    // Gamification: building a weekly plan awards XP (once per plan range).
    try {
      const { awardXpFor } = await import("@/lib/xp.server");
      await awardXpFor(userId, "weekly_plan_completed", `${fromISO}:${toISO}`);
    } catch {
      /* XP is best-effort */
    }

    return {
      meals: planRows.length,
      groceries: inserted,
      skipped: map.size - inserted,
      from: fromISO,
      to: toISO,
    };
  });

// Ingredient substitution suggestions
export const suggestSubstitutions = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((v: unknown) =>
    z
      .object({ ingredient: z.string().min(1).max(120), context: z.string().max(300).optional() })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await requireAiCredit(context.userId);
    await enforceRateLimit("ai_substitute", context.userId, 20);
    const t0 = Date.now();
    try {
      const { data: savedProfile } = await context.firebase
        .from("profiles")
        .select("allergies,dietary_preferences,preferences")
        .eq("id", context.userId)
        .maybeSingle();
      const profile = aiProfile(savedProfile);
      const allergies = (profile?.allergies ?? []) as string[];
      const dietaryPreferences = (profile?.dietary_preferences ?? []) as string[];
      const parsed = await generateAiObject({
        feature: "ingredients.substitutions",
        instructions:
          "You are a culinary substitutions expert. Suggest safe, practical alternatives. Do not suggest any ingredient on the user's allergy list or anything that conflicts with their dietary preferences.",
        prompt: `Give 3 practical substitutes for "${data.ingredient}"${data.context ? ` in the context of ${data.context}` : ""}. Saved preferences: ${profile ? preferenceSummary(profile.preferences) : "none specified"}. Allergies to avoid: ${allergies.join(", ") || "none"}. Dietary preferences: ${dietaryPreferences.join(", ") || "none"}.`,
        schema: z.object({
          substitutes: z
            .array(
              z.object({
                name: z.string().trim().min(1).max(100),
                ratio: z.string().max(40).optional(),
                notes: z.string().max(220).optional(),
              }),
            )
            .length(3),
        }),
      });
      void trackEvent({
        user_id: context.userId,
        kind: "ai",
        name: "ai.substitute",
        latency_ms: Date.now() - t0,
        success: true,
        metadata: { ingredient: data.ingredient },
      });
      return { substitutes: parsed.substitutes ?? [] };
    } catch (err) {
      void trackEvent({
        user_id: context.userId,
        kind: "ai",
        name: "ai.substitute",
        latency_ms: Date.now() - t0,
        success: false,
        error: err instanceof Error ? err.message.slice(0, 500) : String(err),
      });
      throw err;
    }
  });
