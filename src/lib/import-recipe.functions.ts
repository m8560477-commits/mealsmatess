import { createServerFn } from "@tanstack/react-start";
import { requireAiCredit } from "@/lib/ai-credits.server";
import { generateAiObject } from "@/lib/ai-engine.server";
import { curatedRecipeImageUrl } from "@/lib/recipe-image";
import { z } from "zod";
import { slugify } from "@/lib/slug";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { loadFirebaseAdmin } from "@/lib/firebase-admin-access";
import { enforceRateLimit } from "@/lib/security.server";

const RecipeSchema = z.object({
  not_recipe: z.boolean().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
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
  ingredients: z.array(z.object({ name: z.string(), quantity: z.string().optional() })).default([]),
  steps: z.array(z.string()).default([]),
  fun_fact: z.string().nullable().optional(),
  image_prompt: z.string().nullable().optional(),
});

const SYSTEM = `You are MealMate's video-to-recipe assistant. You receive a URL to a short cooking video from TikTok, Instagram Reels, YouTube Shorts, Facebook Reels, or similar. Any scraped caption/title/description text is included.

Rules:
1. If the link clearly refers to a cooking / food-preparation video (based on URL, platform, caption text), infer the recipe. Use your knowledge of common recipes matching the title, creator, or caption. If the caption names the dish, use that dish's authentic recipe. Include realistic ingredients, steps, prep/cook time, servings, difficulty, and nutrition estimates.
2. If the content is clearly NOT a cooking or recipe video, or you cannot reasonably infer a dish, respond with exactly: {"not_recipe": true}

Return ONLY valid JSON (no code fences) matching:
{
  "name": string,
  "description": string (1-2 sentences),
  "cuisine": string,
  "category": "Breakfast" | "Lunch" | "Dinner" | "Dessert" | "Snacks" | "Drinks",
  "country": string,
  "diet_tags": string[],
  "meal_type": string,
  "cooking_time_minutes": number,
  "difficulty": "Easy" | "Medium" | "Hard",
  "servings": number,
  "calories": number,
  "protein_g": number, "carbs_g": number, "fat_g": number,
  "ingredients": [{ "name": string, "quantity": string }],
  "steps": string[],
  "fun_fact": string,
  "image_prompt": string
}`;

const ALLOWED_VIDEO_DOMAINS = [
  "tiktok.com",
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "facebook.com",
  "fb.watch",
];

function isAllowedVideoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      ALLOWED_VIDEO_DOMAINS.some(
        (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    );
  } catch {
    return false;
  }
}

async function scrapeMeta(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MealMateBot/1.0; +https://mealmate.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok || (res.status >= 300 && res.status < 400)) return "";
    const html = await res.text();
    const pick = (re: RegExp) => html.match(re)?.[1]?.trim() ?? "";
    const parts = [
      pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i),
      pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i),
      pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i),
      pick(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i),
      pick(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i),
      pick(/<title>([^<]+)<\/title>/i),
    ].filter(Boolean);
    return parts.join("\n").slice(0, 2000);
  } catch {
    return "";
  }
}

function imageUrlFor(name: string) {
  return curatedRecipeImageUrl({ slug: slugify(name), name }, "hero") ?? null;
}

export const importRecipeFromUrl = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        url: z
          .string()
          .url()
          .max(1000)
          .refine(isAllowedVideoUrl, "Use an HTTPS video URL from TikTok, Instagram, YouTube, or Facebook."),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await requireAiCredit(context.userId);
    await enforceRateLimit("ai_recipe_import", context.userId, 10);

    const meta = await scrapeMeta(data.url);
    const userMsg = `URL: ${data.url}\n\nScraped page metadata (may be empty or blocked by the platform):\n${meta || "(none)"}\n\nInfer the recipe if this is cooking content, otherwise return {"not_recipe": true}.`;

    const parsed = await generateAiObject({
      feature: "recipe.import",
      instructions: SYSTEM,
      prompt: userMsg,
      schema: RecipeSchema,
    });

    if (
      parsed.not_recipe ||
      !parsed.name ||
      parsed.ingredients.length === 0 ||
      parsed.steps.length < 4
    ) {
      throw new Error("No recipe could be detected from this video.");
    }

    const { firebaseAdmin } = await loadFirebaseAdmin();
    const userId = context.userId;

    const slug = `${slugify(parsed.name)}-${Math.random().toString(36).slice(2, 7)}`;
    const row = {
      slug,
      name: parsed.name,
      description: parsed.description ?? null,
      image_url: imageUrlFor(parsed.name),
      cuisine: parsed.cuisine ?? null,
      category: parsed.category ?? null,
      country: parsed.country ?? null,
      diet_tags: parsed.diet_tags ?? [],
      meal_type: parsed.meal_type ?? null,
      cooking_time_minutes: parsed.cooking_time_minutes ?? null,
      difficulty: parsed.difficulty ?? null,
      servings: parsed.servings ?? 2,
      calories: parsed.calories ?? null,
      protein_g: parsed.protein_g ?? null,
      carbs_g: parsed.carbs_g ?? null,
      fat_g: parsed.fat_g ?? null,
      ingredients: parsed.ingredients ?? [],
      steps: parsed.steps ?? [],
      fun_fact: parsed.fun_fact ?? null,
      created_by: userId,
    };

    const { data: inserted, error } = await firebaseAdmin
      .from("recipes")
      .insert(row)
      .select("id,slug")
      .single();
    if (error) throw new Error(error.message);

    // Auto-favorite so the recipe lands in the Cookbook immediately.
    await firebaseAdmin
      .from("favorites")
      .insert({ user_id: userId, recipe_id: inserted.id })
      .then(
        () => null,
        () => null,
      );

    return { slug: inserted.slug, id: inserted.id };
  });

export const updateRecipeBasics = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        cooking_time_minutes: z.number().int().nullable().optional(),
        servings: z.number().int().nullable().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { firebaseAdmin } = await loadFirebaseAdmin();
    const { error } = await firebaseAdmin
      .from("recipes")
      .update({
        name: data.name,
        description: data.description ?? null,
        cooking_time_minutes: data.cooking_time_minutes ?? null,
        servings: data.servings ?? null,
      })
      .eq("id", data.id)
      .eq("created_by", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteImportedRecipe = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { firebaseAdmin } = await loadFirebaseAdmin();
    await firebaseAdmin
      .from("favorites")
      .delete()
      .eq("user_id", context.userId)
      .eq("recipe_id", data.id);
    await firebaseAdmin.from("recipes").delete().eq("id", data.id).eq("created_by", context.userId);
    return { ok: true };
  });
