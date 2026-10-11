import { createServerFn } from "@tanstack/react-start";
import { lovableFetch } from "@/lib/lovable-ai.server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit, trackEvent } from "@/lib/security.server";

const PlanInput = z.object({
  days: z.number().int().min(1).max(14).default(7),
  meals: z.array(z.string()).default(["Breakfast", "Lunch", "Dinner"]),
  startDate: z.string().optional(),
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
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => PlanInput.parse(v))
  .handler(async ({ data, context }) => {
    await enforceRateLimit("ai_planner", context.userId, 5);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("goal,activity_level,allergies,budget_per_day,dietary_preferences,family_size,weight_kg,height_cm,age")
      .eq("id", context.userId)
      .maybeSingle();


    const start = data.startDate ? new Date(data.startDate) : new Date();
    const dates: string[] = [];
    for (let i = 0; i < data.days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }

    const prompt = `Build a ${data.days}-day meal plan for meals: ${data.meals.join(", ")}.
User profile:
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
      const res = await lovableFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a certified nutritionist and chef. Respond with strict JSON only." },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const j = (await res.json()) as { choices: { message: { content: string } }[] };
      const raw = j.choices?.[0]?.message?.content ?? "{}";
      const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const s = cleaned.indexOf("{");
      const e = cleaned.lastIndexOf("}");
      const parsed = JSON.parse(cleaned.slice(s, e + 1)) as {
        plan: Array<{ day: number; meal_type: string; name: string; calories?: number; short_reason?: string }>;
      };
      const suggestions: MealSuggestion[] = (parsed.plan ?? []).map((p) => ({
        day: p.day,
        date: dates[Math.max(0, Math.min(p.day - 1, dates.length - 1))] ?? dates[0] ?? "",
        meal_type: p.meal_type,
        name: p.name,
        calories: p.calories ?? 0,
        short_reason: p.short_reason ?? "",
      }));
      void trackEvent({ user_id: context.userId, kind: "ai", name: "ai.plan_generated", latency_ms: Date.now() - t0, success: true, metadata: { days: data.days, count: suggestions.length } });
      return { suggestions };
    } catch (err) {
      void trackEvent({ user_id: context.userId, kind: "ai", name: "ai.plan_generated", latency_ms: Date.now() - t0, success: false, error: err instanceof Error ? err.message.slice(0, 500) : String(err) });
      throw err;
    }
  });

// Auto-generate grocery list from planned meals in a date range
export const buildGroceryFromPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ from: z.string(), to: z.string() }).parse(v))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: plans, error } = await supabase
      .from("meal_plans")
      .select("recipe_id, recipes(ingredients, name)")
      .gte("plan_date", data.from)
      .lte("plan_date", data.to);
    if (error) throw new Error(error.message);

    // aggregate ingredients by name
    const map = new Map<string, { quantity: string | null; sources: Set<string> }>();
    for (const p of plans ?? []) {
      const rec = (p as { recipes?: { ingredients?: unknown; name?: string } | null }).recipes;
      const ings = Array.isArray(rec?.ingredients) ? (rec!.ingredients as Array<{ name?: string; quantity?: string }>) : [];
      for (const ing of ings) {
        if (!ing?.name) continue;
        const k = ing.name.trim().toLowerCase();
        const cur = map.get(k) ?? { quantity: null, sources: new Set() };
        if (ing.quantity) cur.quantity = cur.quantity ? `${cur.quantity} + ${ing.quantity}` : ing.quantity;
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
    const { error: insErr } = await supabase.from("grocery_items").insert(rows);
    if (insErr) throw new Error(insErr.message);
    void trackEvent({ user_id: context.userId, kind: "planner", name: "planner.autogrocery", success: true, metadata: { inserted: rows.length } });
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
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => PlanAndShopInput.parse(v))
  .handler(async ({ data, context }) => {
    await enforceRateLimit("ai_planner", context.userId, 5);
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "goal,activity_level,allergies,budget_per_day,dietary_preferences,family_size,weight_kg,height_cm,age",
      )
      .eq("id", userId)
      .maybeSingle();


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
      const res = await lovableFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "You are a certified nutritionist and chef. Respond with strict JSON only. Never include allergens the user must avoid.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const j = (await res.json()) as { choices: { message: { content: string } }[] };
      const raw = j.choices?.[0]?.message?.content ?? "{}";
      const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const s = cleaned.indexOf("{");
      const e = cleaned.lastIndexOf("}");
      const parsed = JSON.parse(cleaned.slice(s, e + 1)) as { plan: ShopMeal[] };
      suggestions = (parsed.plan ?? []).filter((p) => p && p.name && p.meal_type);
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
      await supabase
        .from("meal_plans")
        .delete()
        .gte("plan_date", fromISO)
        .lte("plan_date", toISO);
    }

    const planRows = suggestions.map((m) => ({
      user_id: userId,
      plan_date: dates[Math.max(0, Math.min(m.day - 1, dates.length - 1))] ?? fromISO,
      meal_type: m.meal_type,
      custom_name: m.name,
      recipe_id: null as string | null,
    }));
    if (planRows.length > 0) {
      const { error: pErr } = await supabase.from("meal_plans").insert(planRows);
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
    const { data: existing } = await supabase
      .from("grocery_items")
      .select("name")
      .eq("checked", false);
    const have = new Set((existing ?? []).map((r) => r.name.trim().toLowerCase()));

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
      const { error: gErr } = await supabase.from("grocery_items").insert(rows);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ ingredient: z.string().min(1).max(120), context: z.string().max(300).optional() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await enforceRateLimit("ai_substitute", context.userId, 20);
    const t0 = Date.now();
    try {
      const res = await lovableFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a culinary substitutions expert. Return JSON only." },
            {
              role: "user",
              content: `Give 3 practical substitutes for "${data.ingredient}"${data.context ? ` in the context of ${data.context}` : ""}. JSON: {"substitutes":[{"name":"...","ratio":"1:1","notes":"..."}]}`,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const j = (await res.json()) as { choices: { message: { content: string } }[] };
      const raw = j.choices?.[0]?.message?.content ?? "{}";
      const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const s = cleaned.indexOf("{");
      const e = cleaned.lastIndexOf("}");
      const parsed = JSON.parse(cleaned.slice(s, e + 1)) as {
        substitutes: Array<{ name: string; ratio?: string; notes?: string }>;
      };
      void trackEvent({ user_id: context.userId, kind: "ai", name: "ai.substitute", latency_ms: Date.now() - t0, success: true, metadata: { ingredient: data.ingredient } });
      return { substitutes: parsed.substitutes ?? [] };
    } catch (err) {
      void trackEvent({ user_id: context.userId, kind: "ai", name: "ai.substitute", latency_ms: Date.now() - t0, success: false, error: err instanceof Error ? err.message.slice(0, 500) : String(err) });
      throw err;
    }
  });
