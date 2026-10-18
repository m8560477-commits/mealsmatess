import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { RecipeRecord } from "@/lib/queries";
import { curatedRecipeImageUrl } from "@/lib/recipe-image";
import { ensureRecipeImage } from "@/lib/recipe-images.functions";

/** Explicit search submissions only: reuse existing photos, then fill missing ones. */
export async function loadRecipeSearchImages(recipes: RecipeRecord[], queryClient: QueryClient) {
  for (const recipe of recipes.slice(0, 6)) {
    if ((recipe.image_source && recipe.image_url) || curatedRecipeImageUrl(recipe)) continue;
    const result = await ensureRecipeImage({ data: { recipeId: recipe.id } }).catch(() => null);
    if (!result) continue;
    if (result.imageUrl) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recipes"] }),
        queryClient.invalidateQueries({ queryKey: ["recipe", recipe.slug] }),
      ]);
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
