import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Track a recipe view (upsert recently_viewed)
export const trackRecipeView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ recipeId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { error } = await supabase
      .from("recently_viewed")
      .upsert(
        { user_id: context.userId, recipe_id: data.recipeId, viewed_at: new Date().toISOString() },
        { onConflict: "user_id,recipe_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRecentlyViewed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const { data, error } = await supabase
      .from("recently_viewed")
      .select(
        "viewed_at, recipes(id, slug, name, image_url, image_source, cooking_time_minutes, calories)",
      )
      .eq("user_id", context.userId)
      .order("viewed_at", { ascending: false })
      .limit(12);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((r) => (r as { recipes?: unknown }).recipes)
      .filter((x): x is NonNullable<typeof x> => !!x);
  });

// Ratings
export const rateRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    const supabase = context.supabase;
    const { error } = await supabase.from("recipe_ratings").upsert(
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
  .inputValidator((v: unknown) => z.object({ recipeId: z.string().uuid() }).parse(v))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
            h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: rows } = await client
      .from("recipe_ratings")
      .select("rating, review, created_at, user_id")
      .eq("recipe_id", data.recipeId)
      .order("created_at", { ascending: false })
      .limit(50);
    return rows ?? [];
  });
