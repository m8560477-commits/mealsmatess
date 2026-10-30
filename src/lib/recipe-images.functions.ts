import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePremium } from "@/lib/premium-middleware";
import { loadFirebaseAdmin } from "@/lib/firebase-admin-access";
import { RecipeIdSchema } from "@/lib/recipe-id";
import { requestRecipeImage } from "@/lib/recipe-image-request.server";

const RECIPE_COLS =
  "id,name,cuisine,category,meal_type,description,diet_tags,ingredients,steps,created_by,image_url,image_source,image_confidence,image_locked,image_signature,image_checked_at";

const IdSchema = z.object({ recipeId: RecipeIdSchema });

async function loadRecipe(recipeId: string) {
  const { firebaseAdmin } = await loadFirebaseAdmin();
  const { data, error } = await firebaseAdmin
    .from("recipes")
    .select(RECIPE_COLS)
    .eq("id", recipeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Recipe not found");
  return data;
}

async function assertCanEdit(userId: string, createdBy: string | null) {
  if (createdBy && createdBy === userId) return;
  const { isAdmin } = await import("@/lib/marketplace.server");
  if (!(await isAdmin(userId)))
    throw new Error("Only the recipe owner or an admin can change this image");
}

/**
 * Explicit user search only. Never call from page loaders or image rendering.
 * Uses a cached verified photo, otherwise finds and stores a matching photo.
 */
export const ensureRecipeImage = createServerFn({ method: "POST" })
  .middleware([requirePremium])
  .validator((v: unknown) => IdSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { data: accessible, error } = await context.firebase
      .from("recipes")
      .select("id")
      .eq("id", data.recipeId)
      .maybeSingle();
    if (error || !accessible) throw new Error("Recipe not found");
    return requestRecipeImage(context.userId, data.recipeId);
  });

export const getImageAlternatives = createServerFn({ method: "POST" })
  .middleware([requirePremium])
  .validator((v: unknown) => IdSchema.parse(v))
  .handler(async ({ data, context }) => {
    const srv = await import("@/lib/recipe-images.server");
    const r = await loadRecipe(data.recipeId);
    await assertCanEdit(context.userId, r.created_by);
    if (srv.configuredProviders().length === 0)
      return { options: [], reason: "no_provider" as const };
    const options = await srv.findAlternatives(r);
    return {
      options: options.map((c) => ({
        provider: c.provider,
        id: c.id,
        url: c.url,
        thumb: c.thumb,
        title: c.title.slice(0, 120),
        photographer: c.photographer ?? null,
        photographerUrl: c.photographerUrl ?? null,
        pageUrl: c.pageUrl ?? null,
        score: c.score ?? 0,
      })),
      reason: null,
    };
  });

const ChooseSchema = z.object({
  recipeId: RecipeIdSchema,
  provider: z.enum(["Unsplash", "Pexels", "Bing"]),
  id: z.string().min(1).max(300),
});

export const chooseRecipeImage = createServerFn({ method: "POST" })
  .middleware([requirePremium])
  .validator((v: unknown) => ChooseSchema.parse(v))
  .handler(async ({ data, context }) => {
    const srv = await import("@/lib/recipe-images.server");
    const r = await loadRecipe(data.recipeId);
    await assertCanEdit(context.userId, r.created_by);
    // Only accept a photo that our own search returned (never an arbitrary client URL).
    const options = await srv.findAlternatives(r, 20);
    const pick = options.find((c) => c.provider === data.provider && c.id === data.id);
    if (!pick) throw new Error("That image is no longer available. Please pick another.");
    await srv.saveImage(
      r.id,
      { ...pick, score: Math.max(pick.score ?? 0, 95) },
      `manual: ${srv.buildQueries(r)[0]}`,
      {
        locked: true,
        signature: srv.recipeSignature(r),
      },
    );
    return { imageUrl: pick.url };
  });

/** Kept for compatibility; bulk generation is disabled by user preference. */
export const backfillRecipeImages = createServerFn({ method: "POST" })
  .middleware([requirePremium])
  .validator((v: unknown) =>
    z.object({ batchSize: z.number().int().min(1).max(10).default(5) }).parse(v ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { isAdmin } = await import("@/lib/marketplace.server");
    if (!(await isAdmin(context.userId))) throw new Error("Admin access required");
    return { processed: 0, updated: 0, remaining: 0, reason: "search_only" };
  });

export const imageProvidersStatus = createServerFn({ method: "GET" }).handler(async () => {
  const [images, ai] = await Promise.all([
    import("@/lib/recipe-images.server"),
    import("@/lib/ai-engine.server"),
  ]);
  return {
    providers: images.configuredProviders(),
    ai: ai.getAiProviderConfiguration(),
  };
});
