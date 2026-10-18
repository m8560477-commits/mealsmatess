import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
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
    return filterRecipeCatalog(recipes, data);
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
