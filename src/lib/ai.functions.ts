import { createServerFn } from "@tanstack/react-start";
import { lovableFetch } from "@/lib/lovable-ai.server";
import { z } from "zod";
import { slugify } from "@/lib/slug";
import { curatedRecipeImageUrl } from "@/lib/recipe-image";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit, auditLog, trackEvent } from "@/lib/security.server";

const RecipeSchema = z.object({
  name: z.string(),
  description: z.string(),
  cuisine: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  diet_tags: z.array(z.string()).default([]),
  meal_type: z.string().nullable().optional(),
  cooking_time_minutes: z.number().int().nullable().optional(),
  difficulty: z.string().nullable().optional(),
  servings: z.number().int().nullable().optional(),
  calories: z.number().int().nullable().optional(),
  protein_g: z.number().nullable().optional(),
  carbs_g: z.number().nullable().optional(),
  fat_g: z.number().nullable().optional(),
  ingredients: z
    .array(z.object({ name: z.string(), quantity: z.string().optional() }))
    .default([]),
  steps: z.array(z.string()).default([]),
  fun_fact: z.string().nullable().optional(),
  image_prompt: z.string().nullable().optional(),
});

type GeneratedRecipe = z.infer<typeof RecipeSchema>;

const SYSTEM = `You are MealMate, an expert global chef and food writer with deep knowledge of South African cuisine (Pap, Chakalaka, Bunny Chow, Kota, Boerewors, Vetkoek, Mogodu, Samp and Beans, Malva Pudding, Bobotie, Umngqusho) as well as world cuisines.

Return ONLY valid JSON matching this shape (no code fences, no commentary):
{
  "name": string,
  "description": string (1-2 sentences),
  "cuisine": string,
  "category": one of "Breakfast" | "Lunch" | "Dinner" | "Dessert" | "Snacks" | "Drinks",
  "country": string,
  "diet_tags": string[] (subset of ["Vegan","Vegetarian","High Protein","Low Carb","Gluten Free","Healthy","Quick"]),
  "meal_type": string,
  "cooking_time_minutes": number,
  "difficulty": "Easy" | "Medium" | "Hard",
  "servings": number,
  "calories": number (per serving),
  "protein_g": number, "carbs_g": number, "fat_g": number,
  "ingredients": [{ "name": string, "quantity": string }],
  "steps": string[] (5-10 clear steps),
  "fun_fact": string,
  "image_prompt": string (concise, food-photography style)
}`;

function extractJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in response");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callModel(prompt: string): Promise<GeneratedRecipe> {

  const res = await lovableFetch("/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    console.error(`[MealMate AI] Lovable AI request failed with status ${res.status}`);
    throw new Error("AI_REQUEST_FAILED");
  }

  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content ?? "{}";
  return RecipeSchema.parse(extractJson(text));
}

function imageUrlFor(r: GeneratedRecipe): string | null {
  const curated = curatedRecipeImageUrl({ slug: slugify(r.name), name: r.name }, "hero");
  if (curated) return curated;
  return curatedRecipeImageUrl({ slug: slugify(r.name), name: r.name }, "hero") ?? null;
}

function toDbRecipe(r: GeneratedRecipe, userId: string | null) {
  const slug = `${slugify(r.name)}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    slug,
    name: r.name,
    description: r.description,
    image_url: imageUrlFor(r),
    cuisine: r.cuisine ?? null,
    category: r.category ?? null,
    country: r.country ?? null,
    diet_tags: r.diet_tags ?? [],
    meal_type: r.meal_type ?? null,
    cooking_time_minutes: r.cooking_time_minutes ?? null,
    difficulty: r.difficulty ?? null,
    servings: r.servings ?? 2,
    calories: r.calories ?? null,
    protein_g: r.protein_g ?? null,
    carbs_g: r.carbs_g ?? null,
    fat_g: r.fat_g ?? null,
    ingredients: r.ingredients ?? [],
    steps: r.steps ?? [],
    fun_fact: r.fun_fact ?? null,
    created_by: userId,
  };
}

// Surprise Me — signed-in users only, rate limited to 10/min per user
export const surpriseMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await enforceRateLimit("ai_generate", context.userId, 10);
    const themes = [
      "a comforting South African classic",
      "a bold weeknight dinner from anywhere in the world",
      "a fast healthy lunch",
      "a celebratory Sunday dish",
      "a street food favorite",
      "an African diaspora dish",
    ];
    const theme = themes[Math.floor(Math.random() * themes.length)];
    const t0 = Date.now();
    try {
      const recipe = await callModel(
        `Surprise the user with ${theme}. Pick something delightful and specific — not generic. Include one fun fact.`,
      );
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const row = toDbRecipe(recipe, context.userId);
      const { data, error } = await supabaseAdmin
        .from("recipes")
        .insert(row)
        .select("slug")
        .single();
      if (error) throw new Error(error.message);
      void trackEvent({ user_id: context.userId, kind: "ai", name: "ai.surprise_me", latency_ms: Date.now() - t0, success: true, metadata: { theme, name: recipe.name } });
      return { slug: data.slug };
    } catch (e) {
      void trackEvent({ user_id: context.userId, kind: "ai", name: "ai.surprise_me", latency_ms: Date.now() - t0, success: false, error: e instanceof Error ? e.message.slice(0, 500) : String(e) });
      throw e;
    }
  });

// Search / generate a specific recipe — signed-in users only, rate limited.
export const generateRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ query: z.string().trim().min(1).max(200) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await enforceRateLimit("ai_generate", context.userId, 10);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const t0 = Date.now();
    try {
      const { data: exact } = await supabaseAdmin
        .from("recipes")
        .select("slug,name")
        .ilike("name", data.query)
        .limit(1);
      if (exact && exact.length > 0) {
        void trackEvent({ user_id: context.userId, kind: "ai", name: "ai.generate_recipe", latency_ms: Date.now() - t0, success: true, metadata: { query: data.query, cached: true } });
        return { slug: exact[0]?.slug ?? "", cached: true };
      }

      const { data: fuzzy } = await supabaseAdmin
        .from("recipes")
        .select("slug,name")
        .ilike("name", `%${data.query}%`)
        .limit(1);
      if (fuzzy && fuzzy.length > 0) {
        void trackEvent({ user_id: context.userId, kind: "ai", name: "ai.generate_recipe", latency_ms: Date.now() - t0, success: true, metadata: { query: data.query, cached: true } });
        return { slug: fuzzy[0]?.slug ?? "", cached: true };
      }

      const recipe = await callModel(
        `Create a real, authentic recipe for: "${data.query}". If the dish exists in any culture, use the traditional version. Be specific and accurate.`,
      );
      const row = toDbRecipe(recipe, context.userId);
      const { data: inserted, error } = await supabaseAdmin
        .from("recipes")
        .insert(row)
        .select("slug")
        .single();
      if (error) throw new Error(error.message);
      await auditLog({
        actor_id: context.userId,
        action: "recipe.generated",
        target_table: "recipes",
        target_id: inserted.slug,
        metadata: { query: data.query, name: recipe.name },
      });
      void trackEvent({ user_id: context.userId, kind: "ai", name: "ai.generate_recipe", latency_ms: Date.now() - t0, success: true, metadata: { query: data.query, cached: false, name: recipe.name } });
      return { slug: inserted.slug, cached: false };
    } catch (e) {
      void trackEvent({ user_id: context.userId, kind: "ai", name: "ai.generate_recipe", latency_ms: Date.now() - t0, success: false, error: e instanceof Error ? e.message.slice(0, 500) : String(e), metadata: { query: data.query } });
      throw e;
    }
  });

// Kitchen Scan — identify ingredients from a photo
export const scanKitchen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ imageDataUrl: z.string().startsWith("data:image/") }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await enforceRateLimit("ai_vision", context.userId, 10);
    const t0 = Date.now();
    try {
      const res = await lovableFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: 'Identify every distinct food ingredient visible. Reply as JSON only: {"items": [{"name":"tomato","quantity":"2","category":"vegetable"}]}. Use lowercase names.',
                },
                { type: "image_url", image_url: { url: data.imageDataUrl } },
              ],
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Vision API ${res.status}: ${await res.text()}`);
      const j = (await res.json()) as { choices: { message: { content: string } }[] };
      const text = j.choices?.[0]?.message?.content ?? "{}";
      const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
        items: { name: string; quantity?: string; category?: string }[];
      };
      const items = parsed.items ?? [];
      void trackEvent({ user_id: context.userId, kind: "scan", name: "scan.kitchen", latency_ms: Date.now() - t0, success: true, metadata: { item_count: items.length } });
      return items;
    } catch (e) {
      void trackEvent({ user_id: context.userId, kind: "scan", name: "scan.kitchen", latency_ms: Date.now() - t0, success: false, error: e instanceof Error ? e.message.slice(0, 500) : String(e) });
      throw e;
    }
  });

const DishSchema = z.object({
  is_food: z.boolean().default(true),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  cuisine: z.string().nullable().optional(),
  meal_type: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.7),
  portion: z.string().nullable().optional(),
  calories: z.number().nullable().optional(),
  protein_g: z.number().nullable().optional(),
  carbs_g: z.number().nullable().optional(),
  fat_g: z.number().nullable().optional(),
  fiber_g: z.number().nullable().optional(),
  ingredients: z.array(z.string()).default([]),
  health_note: z.string().nullable().optional(),
});
export type ScannedDish = z.infer<typeof DishSchema>;

// Dish Scan — identify a plated meal and estimate its nutrition
export const scanDish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ imageDataUrl: z.string().startsWith("data:image/") }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await enforceRateLimit("ai_vision", context.userId, 10);
    const t0 = Date.now();
    try {
      const res = await lovableFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `You are a nutritionist who knows South African and global dishes. Look at the photo and identify the dish shown. Estimate nutrition for the visible portion.
Reply with JSON only (no code fences):
{"is_food": boolean, "name": string (dish name, e.g. "Bunny Chow", "Chicken Biryani"), "description": string (one sentence), "cuisine": string, "meal_type": "Breakfast"|"Lunch"|"Dinner"|"Snack", "confidence": number 0-1, "portion": string (e.g. "1 plate, ~350 g"), "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "fiber_g": number, "ingredients": string[] (main visible components), "health_note": string (one short tip)}
If the photo does not show food, set is_food to false and name to "Not food".`,
                },
                { type: "image_url", image_url: { url: data.imageDataUrl } },
              ],
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Vision API ${res.status}: ${await res.text()}`);
      const j = (await res.json()) as { choices: { message: { content: string } }[] };
      const dish = DishSchema.parse(extractJson(j.choices?.[0]?.message?.content ?? "{}"));
      void trackEvent({ user_id: context.userId, kind: "scan", name: "scan.dish", latency_ms: Date.now() - t0, success: true, metadata: { name: dish.name, confidence: dish.confidence, is_food: dish.is_food } });
      return dish;
    } catch (e) {
      void trackEvent({ user_id: context.userId, kind: "scan", name: "scan.dish", latency_ms: Date.now() - t0, success: false, error: e instanceof Error ? e.message.slice(0, 500) : String(e) });
      throw e;
    }
  });


// Ask anything about food — a single-turn Q&A used by the AI Chat quick action
export const askFoodQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ question: z.string().trim().min(1).max(500) }).parse(v))
  .handler(async ({ data, context }) => {
    await enforceRateLimit("ai_chat", context.userId, 20);
    const t0 = Date.now();
    try {
      const res = await lovableFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "You are MealMate's kitchen assistant. Answer food, cooking, nutrition, and ingredient-substitution questions clearly and concisely, in 2-4 short paragraphs or a short list. Plain text only, no markdown headers.",
            },
            { role: "user", content: data.question },
          ],
        }),
      });
      if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
      const j = (await res.json()) as { choices: { message: { content: string } }[] };
      const answer = j.choices?.[0]?.message?.content ?? "";
      void trackEvent({ user_id: context.userId, kind: "ai", name: "ai.chat_question", latency_ms: Date.now() - t0, success: true, metadata: { q_len: data.question.length, a_len: answer.length } });
      return { answer };
    } catch (e) {
      void trackEvent({ user_id: context.userId, kind: "ai", name: "ai.chat_question", latency_ms: Date.now() - t0, success: false, error: e instanceof Error ? e.message.slice(0, 500) : String(e) });
      throw e;
    }
  });

// Regenerate a recipe's hero image with Lovable AI (gemini-3-pro-image).
// Premium-only. Uploads to the community-media bucket and updates recipes.image_url.
export const regenerateRecipeImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ slug: z.string().min(1) }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Premium gate — check for an active subscription
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("status,period_end,tier")
      .eq("user_id", context.userId)
      .in("status", ["trialing", "active", "in_grace"])
      .order("period_end", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const now = Date.now();
    const isPremium =
      !!sub &&
      (sub.tier === "lifetime" || !sub.period_end || new Date(sub.period_end).getTime() > now);
    if (!isPremium) throw new Error("Premium required to regenerate images");

    await enforceRateLimit("ai_image", context.userId, 5);

    const { data: recipe, error: rErr } = await supabaseAdmin
      .from("recipes")
      .select("id, slug, name, cuisine, country")
      .eq("slug", data.slug)
      .single();
    if (rErr || !recipe) throw new Error("Recipe not found");


    const prompt =
      `Authentic ${recipe.name}${recipe.cuisine ? ` from ${recipe.cuisine} cuisine` : ""}` +
      `${recipe.country ? `, traditional ${recipe.country} dish` : ""}. ` +
      `Hyperrealistic food photography, DSLR 50mm, natural window light, ` +
      `shallow depth of field, plated on real crockery, top-down or 3/4 angle. ` +
      `Photorealistic — not an illustration, not a 3d render.`;

    const t0 = Date.now();
    try {
      const res = await lovableFetch("/images/generations", {
        method: "POST",
        body: JSON.stringify({
          model: "google/gemini-3-pro-image",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });
      if (!res.ok) throw new Error(`Image gateway ${res.status}: ${await res.text()}`);
      const j = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = j.data?.[0]?.b64_json;
      if (!b64) throw new Error("No image returned");

      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const path = `recipes/${recipe.slug}-${Date.now()}.png`;
      const { error: upErr } = await supabaseAdmin.storage
        .from("community-media")
        .upload(path, bytes, { contentType: "image/png", upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from("community-media")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr || !signed) throw new Error(signErr?.message ?? "Failed to sign url");
      const publicUrl = signed.signedUrl;

      const { error: updErr } = await supabaseAdmin
        .from("recipes")
        .update({ image_url: publicUrl })
        .eq("id", recipe.id);
      if (updErr) throw new Error(updErr.message);

      void trackEvent({ user_id: context.userId, kind: "ai", name: "ai.regen_image", latency_ms: Date.now() - t0, success: true, metadata: { slug: recipe.slug } });
      return { image_url: publicUrl };
    } catch (e) {
      void trackEvent({ user_id: context.userId, kind: "ai", name: "ai.regen_image", latency_ms: Date.now() - t0, success: false, error: e instanceof Error ? e.message.slice(0, 500) : String(e), metadata: { slug: recipe.slug } });
      throw e;
    }
  });
