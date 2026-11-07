import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePremium } from "@/lib/premium-middleware";
import { recipeCatalogRecord } from "@/lib/recipe-catalog";

export const listRecipeCatalog = createServerFn({ method: "GET" })
  .middleware([requirePremium])
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
    const { readRecipeCatalogPage } = await import("@/lib/recipe-catalog.server");
    const recipes = [];
    let cursor: string | undefined;
    do {
      const page = await readRecipeCatalogPage({
        ...data,
        limit: data.limit - recipes.length,
        cursor,
      });
      recipes.push(...page.recipes);
      cursor = page.nextCursor ?? undefined;
    } while (cursor && recipes.length < data.limit);
    return recipes;
  });

export const getRecipeCatalogEntry = createServerFn({ method: "GET" })
  .middleware([requirePremium])
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

/** A cursor page never reads the complete catalog to produce its first response. */
export const listRecipeCatalogPage = createServerFn({ method: "GET" })
  .middleware([requirePremium])
  .validator((input: unknown) =>
    z
      .object({
        category: z.string().trim().max(80).optional(),
        search: z.string().trim().max(200).default(""),
        limit: z.number().int().min(1).max(60).default(12),
        cursor: z.string().max(4096).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { readRecipeCatalogPage } = await import("@/lib/recipe-catalog.server");
    return readRecipeCatalogPage(data);
  });
