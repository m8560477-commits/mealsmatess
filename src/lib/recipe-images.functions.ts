import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { loadFirebaseAdmin } from "@/lib/firebase-admin-access";

const RECIPE_COLS =
  "id,name,cuisine,category,meal_type,description,diet_tags,ingredients,steps,created_by,image_url,image_source,image_confidence,image_locked,image_signature,image_checked_at";

const IdSchema = z.object({ recipeId: z.string().uuid() });

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
  .middleware([requireFirebaseAuth])
  .inputValidator((v: unknown) => IdSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { data: accessible, error } = await context.firebase
      .from("recipes")
      .select("id")
      .eq("id", data.recipeId)
      .maybeSingle();
    if (error || !accessible) throw new Error("Recipe not found");
    const srv = await import("@/lib/recipe-images.server");
    const r = await loadRecipe(data.recipeId);
    const signature = srv.recipeSignature(r);
    if (!srv.needsSearch(r, signature)) {
      return {
        imageUrl: r.image_source ? r.image_url : null,
        source: r.image_source,
        confidence: r.image_confidence,
        searched: false,
      };
    }
    const { firebaseAdmin } = await loadFirebaseAdmin();
    // Each recipe gets its own AI photo built from its ingredients and steps, generated once and reused.
    {
      const { data: ok } = await firebaseAdmin.rpc("check_rate_limit", {
        _bucket: "recipe_image_ai",
        _identifier: context.userId,
        _max_per_minute: 6,
      });
      if (ok === false)
        return {
          imageUrl: null,
          source: null,
          confidence: null,
          searched: false,
          reason: "rate_limited",
        };
      const { data: credit } = await firebaseAdmin.rpc("consume_image_credit", {
        _user_id: context.userId,
      });
      const c = credit as {
        allowed?: boolean;
        max?: number;
        resets_at?: string;
        premium?: boolean;
      } | null;
      if (c && c.allowed === false) {
        return {
          imageUrl: null,
          source: null,
          confidence: null,
          searched: false,
          reason: "limit",
          limit: c.max ?? null,
          resetsAt: c.resets_at ?? null,
          premium: !!c.premium,
        };
      }
      // Claim the recipe so simultaneous searches don't generate twice.
      await srv.markChecked(r.id, signature);
      let url: string | null = null;
      for (let attempt = 0; attempt < 2 && !url; attempt++) {
        try {
          url = await srv.generateAndSaveAiImage(r, signature);
        } catch (e) {
          console.error("recipe image attempt failed", e);
        }
        if (!url && attempt === 0) await new Promise((res) => setTimeout(res, 1500));
      }
      if (url) return { imageUrl: url, source: "AI", confidence: 100, searched: true };
      // Release the claim so a later search can retry.
      await firebaseAdmin.from("recipes").update({ image_checked_at: null }).eq("id", r.id);
      if (srv.configuredProviders().length === 0) {
        return { imageUrl: null, source: null, confidence: null, searched: true, reason: "failed" };
      }
    }
    if (srv.configuredProviders().length === 0) {
      return {
        imageUrl: null,
        source: null,
        confidence: null,
        searched: false,
        reason: "no_provider",
      };
    }
    // Global throttle protects the image APIs from bursts of page views.
    const { data: allowed } = await firebaseAdmin.rpc("check_rate_limit", {
      _bucket: "recipe_image_search",
      _identifier: "global",
      _max_per_minute: 20,
    });
    if (allowed === false)
      return {
        imageUrl: null,
        source: null,
        confidence: null,
        searched: false,
        reason: "rate_limited",
      };

    // Claim the recipe so concurrent viewers don't trigger duplicate searches.
    await srv.markChecked(r.id, signature);
    const result = await srv.findBestImage(r);
    if (!result.best || !result.query) {
      return {
        imageUrl: null,
        source: null,
        confidence: null,
        searched: true,
        reason: result.reason,
      };
    }
    await srv.saveImage(r.id, result.best, result.query, { signature });
    return {
      imageUrl: result.best.url,
      source: result.best.provider,
      confidence: result.best.score ?? null,
      searched: true,
    };
  });

export const getImageAlternatives = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((v: unknown) => IdSchema.parse(v))
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
  recipeId: z.string().uuid(),
  provider: z.enum(["Unsplash", "Pexels", "Bing"]),
  id: z.string().min(1).max(300),
});

export const chooseRecipeImage = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((v: unknown) => ChooseSchema.parse(v))
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
  .middleware([requireFirebaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ batchSize: z.number().int().min(1).max(10).default(5) }).parse(v ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { isAdmin } = await import("@/lib/marketplace.server");
    if (!(await isAdmin(context.userId))) throw new Error("Admin access required");
    return { processed: 0, updated: 0, remaining: 0, reason: "search_only" };
  });

export const imageProvidersStatus = createServerFn({ method: "GET" }).handler(async () => {
  const srv = await import("@/lib/recipe-images.server");
  return { providers: srv.configuredProviders(), ai: !!process.env["LOVABLE_API_KEY"] };
});
