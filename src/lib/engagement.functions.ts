import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { loadFirebaseAdmin } from "@/lib/firebase-admin-access";

// Track a recipe view (upsert recently_viewed)
export const trackRecipeView = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((v: unknown) => z.object({ recipeId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const firebase = context.firebase;
    const { error } = await firebase
      .from("recently_viewed")
      .upsert(
        { user_id: context.userId, recipe_id: data.recipeId, viewed_at: new Date().toISOString() },
        { onConflict: "user_id,recipe_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRecentlyViewed = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const firebase = context.firebase;
    const { data: views, error } = await firebase
      .from("recently_viewed")
      .select("recipe_id")
      .eq("user_id", context.userId)
      .order("viewed_at", { ascending: false })
      .limit(12);
    if (error) throw new Error(error.message);
    const { firebaseAdmin } = await loadFirebaseAdmin();
    const recipes = await Promise.all(
      (views ?? []).map(async (view: { recipe_id: string }) => {
        const { data: recipe } = await firebaseAdmin
          .from("recipes")
          .select("id, slug, name, image_url, image_source, cooking_time_minutes, calories")
          .eq("id", view.recipe_id)
          .maybeSingle();
        return recipe;
      }),
    );
    return recipes.filter((recipe): recipe is NonNullable<typeof recipe> => !!recipe);
  });

// Ratings
export const rateRecipe = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        recipeId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        review: z.string().max(1000).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const firebase = context.firebase;
    const { error } = await firebase.from("recipe_ratings").upsert(
      {
        user_id: context.userId,
        recipe_id: data.recipeId,
        rating: data.rating,
        review: data.review ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,recipe_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRecipeRatings = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((v: unknown) => z.object({ recipeId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { firebaseAdmin } = await loadFirebaseAdmin();
    const { data: rows, error } = await firebaseAdmin
      .from("recipe_ratings")
      .select("id, user_id, rating, review, created_at")
      .eq("recipe_id", data.recipeId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row: { user_id: string; [key: string]: unknown }) => {
      const { user_id, ...review } = row;
      return { ...review, isMine: user_id === context.userId };
    });
  });
