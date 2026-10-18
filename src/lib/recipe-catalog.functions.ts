import { aiProfile } from "@/lib/ai-profile";
import { EMPTY_PREFERENCES } from "@/lib/preferences";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { preferenceScore } from "@/lib/preferences";
import { recipeMatchesDiet } from "@/lib/recipe-safety";
import { filterRecipeCatalog, recipeCatalogRecord } from "@/lib/recipe-catalog";

export const listRecipeCatalog = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        category: z.string().trim().max(80).optional(),
        search: z.string().trim().max(200).default(""),
        limit: z.number().int().min(1).max(60).default(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.firebase
      .from("recipes")
      .select("*")
      .order("created_at", { ascending: false, nullsFirst: false });
    if (error) throw error;
    const recipes = (rows as Record<string, unknown>[])
      .map(recipeCatalogRecord)
      .filter((recipe) => recipe !== null);
    // Apply matching before the result limit, including older rows without created_at.
    const { data: profile, error: profileError } = await context.firebase
      .from("profiles")
      .select("preferences,allergies,dietary_preferences")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw profileError;
    const prefs = aiProfile(profile)?.preferences ?? EMPTY_PREFERENCES;
    const safe = recipes.filter((recipe) => recipeMatchesDiet(prefs, recipe));
    safe.sort(
      (a, b) =>
        preferenceScore(prefs, b.name, b.cuisine) - preferenceScore(prefs, a.name, a.cuisine),
    );
    return filterRecipeCatalog(safe, data);
  });

export const getRecipeCatalogEntry = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .validator((input: unknown) => z.object({ slug: z.string().trim().min(1).max(300) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.firebase
      .from("recipes")
      .select("*")
      .eq("slug", data.slug)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return row ? recipeCatalogRecord(row) : null;
  });
