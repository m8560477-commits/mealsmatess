import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { RecipeRecord } from "@/lib/queries";
import { curatedRecipeImageUrl } from "@/lib/recipe-image";
import { ensureRecipeImage } from "@/lib/recipe-images.functions";

const inFlight = new Map<string, ReturnType<typeof ensureRecipeImage>>();
function ensurePhoto(id: string) {
  const existing = inFlight.get(id);
  if (existing) return existing;
  const request = ensureRecipeImage({ data: { recipeId: id } });
  inFlight.set(id, request);
  void request
    .finally(() => {
      if (inFlight.get(id) === request) inFlight.delete(id);
    })
    .catch(() => undefined);
  return request;
}
export function patchRecipePhoto(
  data: unknown,
  id: string,
  image_url: string,
  image_source: string | null,
): unknown {
  if (Array.isArray(data))
    return data.map((row) => patchRecipePhoto(row, id, image_url, image_source));
  if (!data || typeof data !== "object") return data;
  const row = data as Record<string, unknown>;
  if (row.id === id) return { ...row, image_url, image_source };
  if (Array.isArray(row.pages))
    return {
      ...row,
      pages: row.pages.map((page) => patchRecipePhoto(page, id, image_url, image_source)),
    };
  if (Array.isArray(row.recipes))
    return { ...row, recipes: patchRecipePhoto(row.recipes, id, image_url, image_source) };
  return data;
}
/** Explicit searches reuse stored photos; a saved photo patches cached lists without refetching them. */
export async function loadRecipeSearchImages(recipes: RecipeRecord[], queryClient: QueryClient) {
  for (const recipe of recipes.slice(0, 6)) {
    if ((recipe.image_source && recipe.image_url) || curatedRecipeImageUrl(recipe)) continue;
    const result = await ensurePhoto(recipe.id).catch(() => {
      toast.error("Couldn't create a recipe photo", {
        description: "Please try again from the recipe page.",
      });
      return null;
    });
    if (!result) break;
    if (result.imageUrl && result.source) {
      const patch = (data: unknown) =>
        patchRecipePhoto(data, recipe.id, result.imageUrl!, result.source);
      queryClient.setQueriesData({ queryKey: ["recipes"] }, patch);
      queryClient.setQueryData(["recipe", recipe.slug], patch);
    }
    if (result.reason === "limit") {
      toast.message("Daily photo allowance reached", {
        description: "Try creating more recipe photos tomorrow. Premium includes more.",
      });
      break;
    }
    if (result.reason === "rate_limited") break;
  }
}
