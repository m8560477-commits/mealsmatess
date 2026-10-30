import { aiProfile } from "@/lib/ai-profile";
import { preferenceSummary } from "@/lib/preferences";
import { createServerFn } from "@tanstack/react-start";
import { requireAiCredit } from "@/lib/ai-credits.server";
import {
  aiRequestFingerprint,
  deduplicateAiRequest,
  generateAiObject,
  generateAiText,
  imageInputFromDataUrl,
} from "@/lib/ai-engine.server";
import { z } from "zod";
import { slugify } from "@/lib/slug";
import { curatedRecipeImageUrl } from "@/lib/recipe-image";
import { requirePremium } from "@/lib/premium-middleware";
import { loadFirebaseAdmin } from "@/lib/firebase-admin-access";
import { enforceRateLimit, auditLog, trackEvent } from "@/lib/security.server";

const RecipeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).max(600),
  cuisine: z.string().nullable().optional(),
  category: z
    .enum(["Breakfast", "Lunch", "Dinner", "Dessert", "Snacks", "Drinks"])
    .nullable()
    .optional(),
  country: z.string().nullable().optional(),
  diet_tags: z.array(z.string()).default([]),
  meal_type: z.string().nullable().optional(),
  cooking_time_minutes: z.number().int().min(1).max(720).nullable().optional(),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).nullable().optional(),
  servings: z.number().int().min(1).max(24).nullable().optional(),
  calories: z.number().int().min(0).max(10000).nullable().optional(),
  protein_g: z.number().min(0).max(1000).nullable().optional(),
  carbs_g: z.number().min(0).max(1000).nullable().optional(),
  fat_g: z.number().min(0).max(1000).nullable().optional(),
  ingredients: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(180),
        quantity: z.string().trim().min(1).max(80),
      }),
    )
    .min(2)
    .max(40),
  steps: z.array(z.string().trim().min(1).max(700)).min(4).max(12),
  fun_fact: z.string().nullable().optional(),
  image_prompt: z.string().nullable().optional(),
});

type GeneratedRecipe = z.infer<typeof RecipeSchema>;

const SYSTEM = `You are MealMate, an expert global chef and food writer with deep knowledge of South African cuisine (Pap, Chakalaka, Bunny Chow, Kota, Boerewors, Vetkoek, Mogodu, Samp and Beans, Malva Pudding, Bobotie, Umngqusho) as well as world cuisines.

Return ONLY valid JSON matching this shape (no code fences, no commentary). Avoid claiming precision for nutrition: provide conservative rounded estimates per serving; the app labels these values as estimates. Always honor stated allergies and dietary restrictions, and never include an allergen even as a garnish or optional ingredient:
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
  "calories": number (rough estimate per serving),
  "protein_g": number, "carbs_g": number, "fat_g": number (rough estimates per serving),
  "ingredients": [{ "name": string, "quantity": string }],
  "steps": string[] (5-10 clear steps),
  "fun_fact": string,
  "image_prompt": string (concise, food-photography style)
}`;

async function callModel(prompt: string): Promise<GeneratedRecipe> {
  return generateAiObject({
    feature: "recipe.generate",
    instructions: SYSTEM,
    prompt,
    schema: RecipeSchema,
  });
}

function imageUrlFor(r: GeneratedRecipe): string | null {
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
  .middleware([requirePremium])
  .handler(async ({ context }) => {
    await requireAiCredit(context.userId);
    await enforceRateLimit("ai_generate", context.userId, 10);
    const { firebaseAdmin } = await loadFirebaseAdmin();
    const { data: savedProfile } = await firebaseAdmin
      .from("profiles")
      .select("allergies,dietary_preferences,preferences")
      .eq("id", context.userId)
      .maybeSingle();
    const profile = aiProfile(savedProfile);
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
        `Surprise the user with ${theme}. Pick something delightful and specific — not generic. Include one fun fact. Saved preferences: ${profile ? preferenceSummary(profile.preferences) : "none specified"}. Dietary preferences: ${(profile?.dietary_preferences ?? []).join(", ") || "none specified"}. Allergies that must be excluded: ${(profile?.allergies ?? []).join(", ") || "none specified"}.`,
      );
      const row = toDbRecipe(recipe, context.userId);
      const { data, error } = await firebaseAdmin
        .from("recipes")
        .insert(row)
        .select("id,slug")
        .single();
      if (error) throw new Error(error.message);
      void trackEvent({
        user_id: context.userId,
        kind: "ai",
        name: "ai.surprise_me",
        latency_ms: Date.now() - t0,
        success: true,
        metadata: { theme, name: recipe.name },
      });
      return { slug: data.slug };
    } catch (e) {
      void trackEvent({
        user_id: context.userId,
        kind: "ai",
        name: "ai.surprise_me",
        latency_ms: Date.now() - t0,
        success: false,
        error: e instanceof Error ? e.message.slice(0, 500) : String(e),
      });
      throw e;
    }
  });

// Search / generate a specific recipe — signed-in users only, rate limited.
export const generateRecipe = createServerFn({ method: "POST" })
  .middleware([requirePremium])
  .validator((v: unknown) => z.object({ query: z.string().trim().min(1).max(200) }).parse(v))
  .handler(async ({ data, context }) => {
    const requestKey = aiRequestFingerprint(
      context.userId,
      "recipe.generate",
      data.query.toLowerCase(),
    );
    return deduplicateAiRequest(requestKey, async () => {
      await enforceRateLimit("ai_generate", context.userId, 10);
      const { firebaseAdmin } = await loadFirebaseAdmin();
      const t0 = Date.now();
      try {
        const { data: exact } = await firebaseAdmin
          .from("recipes")
          .select("id,slug,name")
          .ilike("name", data.query)
          .limit(1);
        if (exact && exact.length > 0) {
          void trackEvent({
            user_id: context.userId,
            kind: "ai",
            name: "ai.generate_recipe",
            latency_ms: Date.now() - t0,
            success: true,
            metadata: { query: data.query, cached: true },
          });
          return { slug: exact[0]?.slug ?? "", id: exact[0]?.id ?? null, cached: true };
        }

        const { data: fuzzy } = await firebaseAdmin
          .from("recipes")
          .select("id,slug,name")
          .ilike("name", `%${data.query}%`)
          .limit(1);
        if (fuzzy && fuzzy.length > 0) {
          void trackEvent({
            user_id: context.userId,
            kind: "ai",
            name: "ai.generate_recipe",
            latency_ms: Date.now() - t0,
            success: true,
            metadata: { query: data.query, cached: true },
          });
          return { slug: fuzzy[0]?.slug ?? "", id: fuzzy[0]?.id ?? null, cached: true };
        }

        await requireAiCredit(context.userId);
        const { data: savedProfile } = await firebaseAdmin
          .from("profiles")
          .select("allergies,dietary_preferences,preferences")
          .eq("id", context.userId)
          .maybeSingle();
        const profile = aiProfile(savedProfile);
        const allergies = (profile?.allergies ?? []) as string[];
        const dietaryPreferences = (profile?.dietary_preferences ?? []) as string[];
        const recipe = await callModel(
          [
            `Create a real, authentic recipe for: "${data.query}". If the dish exists in any culture, use the traditional version. Be specific and accurate.`,
            `Saved preferences: ${profile ? preferenceSummary(profile.preferences) : "none specified"}.`,
            `Dietary preferences: ${dietaryPreferences.join(", ") || "none specified"}.`,
            `Allergies that must be completely excluded: ${allergies.join(", ") || "none specified"}.`,
            "Use requested ingredients where possible, include practical quantities and at least four actionable steps.",
          ].join("\n"),
        );
        const ingredientTokens = new Set(
          recipe.ingredients
            .flatMap((ingredient) => ingredient.name.toLowerCase().split(/[^a-z0-9]+/))
            .filter(Boolean)
            .map((word) => word.replace(/s$/, "")),
        );
        const allergyConflict = allergies.some((allergy) =>
          allergy
            .trim()
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((word) => word.length > 2)
            .some((word) => ingredientTokens.has(word.replace(/s$/, ""))),
        );
        if (allergyConflict) {
          throw new Error(
            "The generated recipe conflicted with a saved allergy. Please try again.",
          );
        }
        const row = toDbRecipe(recipe, context.userId);
        const { data: inserted, error } = await firebaseAdmin
          .from("recipes")
          .insert(row)
          .select("id,slug")
          .single();
        if (error) throw new Error(error.message);
        await auditLog({
          actor_id: context.userId,
          action: "recipe.generated",
          target_table: "recipes",
          target_id: inserted.slug,
          metadata: { query: data.query, name: recipe.name },
        });
        void trackEvent({
          user_id: context.userId,
          kind: "ai",
          name: "ai.generate_recipe",
          latency_ms: Date.now() - t0,
          success: true,
          metadata: { query: data.query, cached: false, name: recipe.name },
        });
        return { slug: inserted.slug, id: inserted.id as string | null, cached: false };
      } catch (e) {
        void trackEvent({
          user_id: context.userId,
          kind: "ai",
          name: "ai.generate_recipe",
          latency_ms: Date.now() - t0,
          success: false,
          error: e instanceof Error ? e.message.slice(0, 500) : String(e),
          metadata: { query: data.query },
        });
        throw e;
      }
    });
  });

// Kitchen Scan — identify ingredients from a photo
export const scanKitchen = createServerFn({ method: "POST" })
  .middleware([requirePremium])
  .validator((v: unknown) =>
    z.object({ imageDataUrl: z.string().startsWith("data:image/").max(11_200_000) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await requireAiCredit(context.userId);
    await enforceRateLimit("ai_vision", context.userId, 10);
    const t0 = Date.now();
    try {
      const { bytes, mediaType } = imageInputFromDataUrl(data.imageDataUrl);
      const result = await generateAiObject({
        feature: "scan.kitchen",
        instructions:
          "Identify only visible food ingredients. Use lowercase ingredient names and never infer items that are not visible.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Identify every distinct food ingredient visible. Return items with name, quantity, and category. Use lowercase names.",
              },
              { type: "image", image: bytes, mediaType },
            ],
          },
        ],
        schema: z.object({
          items: z
            .array(
              z.object({
                name: z.string().trim().min(1).max(80),
                quantity: z.string().max(80).optional(),
                category: z.string().max(60).optional(),
              }),
            )
            .max(40),
        }),
      });
      const items = result.items;
      void trackEvent({
        user_id: context.userId,
        kind: "scan",
        name: "scan.kitchen",
        latency_ms: Date.now() - t0,
        success: true,
        metadata: { item_count: items.length },
      });
      return items;
    } catch (e) {
      void trackEvent({
        user_id: context.userId,
        kind: "scan",
        name: "scan.kitchen",
        latency_ms: Date.now() - t0,
        success: false,
        error: e instanceof Error ? e.message.slice(0, 500) : String(e),
      });
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
  .middleware([requirePremium])
  .validator((v: unknown) =>
    z.object({ imageDataUrl: z.string().startsWith("data:image/").max(11_200_000) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await requireAiCredit(context.userId);
    await enforceRateLimit("ai_vision", context.userId, 10);
    const t0 = Date.now();
    try {
      const { bytes, mediaType } = imageInputFromDataUrl(data.imageDataUrl);
      const dish = await generateAiObject({
        feature: "scan.dish",
        instructions:
          "You are a food identification assistant. Nutritional values must be clearly treated as approximate estimates, not precise medical advice.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Identify the dish shown and give rough rounded nutrition estimates for the visible portion. Return is_food, name, description, cuisine, meal_type, confidence from 0 to 1, portion, calories, protein_g, carbs_g, fat_g, fiber_g, ingredients, and a short health_note. If it is not food, set is_food false and name "Not food".`,
              },
              { type: "image", image: bytes, mediaType },
            ],
          },
        ],
        schema: DishSchema,
      });
      void trackEvent({
        user_id: context.userId,
        kind: "scan",
        name: "scan.dish",
        latency_ms: Date.now() - t0,
        success: true,
        metadata: { name: dish.name, confidence: dish.confidence, is_food: dish.is_food },
      });
      return dish;
    } catch (e) {
      void trackEvent({
        user_id: context.userId,
        kind: "scan",
        name: "scan.dish",
        latency_ms: Date.now() - t0,
        success: false,
        error: e instanceof Error ? e.message.slice(0, 500) : String(e),
      });
      throw e;
    }
  });

// Ask anything about food — a single-turn Q&A used by the AI Chat quick action
export const askFoodQuestion = createServerFn({ method: "POST" })
  .middleware([requirePremium])
  .validator((v: unknown) => z.object({ question: z.string().trim().min(1).max(500) }).parse(v))
  .handler(async ({ data, context }) => {
    await requireAiCredit(context.userId);
    await enforceRateLimit("ai_chat", context.userId, 20);
    const t0 = Date.now();
    try {
      const answer = await generateAiText({
        feature: "chat.food_question",
        instructions:
          "You are MealMate's kitchen assistant. Answer food, cooking, nutrition, and ingredient-substitution questions clearly and concisely, in 2-4 short paragraphs or a short list. Treat nutrition as estimates, not precise values. Plain text only, no markdown headers.",
        prompt: data.question,
      });
      void trackEvent({
        user_id: context.userId,
        kind: "ai",
        name: "ai.chat_question",
        latency_ms: Date.now() - t0,
        success: true,
        metadata: { q_len: data.question.length, a_len: answer.length },
      });
      return { answer };
    } catch (e) {
      void trackEvent({
        user_id: context.userId,
        kind: "ai",
        name: "ai.chat_question",
        latency_ms: Date.now() - t0,
        success: false,
        error: e instanceof Error ? e.message.slice(0, 500) : String(e),
      });
      throw e;
    }
  });

// Premium-only. Uses the same generated-image storage and metadata path as recipe browsing.
export const regenerateRecipeImage = createServerFn({ method: "POST" })
  .middleware([requirePremium])
  .validator((v: unknown) => z.object({ slug: z.string().min(1) }).parse(v))
  .handler(async ({ data, context }) => {
    await requireAiCredit(context.userId);
    const { firebaseAdmin } = await loadFirebaseAdmin();

    // Premium gate — check for an active subscription
    const { data: sub } = await firebaseAdmin
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

    const { data: recipe, error: rErr } = await firebaseAdmin
      .from("recipes")
      .select("id, slug, name, cuisine, country, ingredients, steps")
      .eq("slug", data.slug)
      .single();
    if (rErr || !recipe) throw new Error("Recipe not found");

    const t0 = Date.now();
    try {
      const imageService = await import("@/lib/recipe-images.server");
      const signature = imageService.recipeSignature(recipe);
      const imageUrl = await deduplicateAiRequest(
        aiRequestFingerprint(context.userId, "image.regenerate", recipe.id),
        () => imageService.generateAndSaveAiImage(recipe, signature),
      );
      if (!imageUrl) throw new Error("No image was generated for this recipe.");

      void trackEvent({
        user_id: context.userId,
        kind: "ai",
        name: "ai.regen_image",
        latency_ms: Date.now() - t0,
        success: true,
        metadata: { slug: recipe.slug },
      });
      return { image_url: imageUrl };
    } catch (e) {
      void trackEvent({
        user_id: context.userId,
        kind: "ai",
        name: "ai.regen_image",
        latency_ms: Date.now() - t0,
        success: false,
        error: e instanceof Error ? e.message.slice(0, 500) : String(e),
        metadata: { slug: recipe.slug },
      });
      throw e;
    }
  });
