import { firebaseAdmin } from "@/server/firebase-admin";
import { aiRequestFingerprint, deduplicateAiRequest } from "@/lib/ai-engine.server";
import { enforceAiRateLimit } from "@/server/ai-rate-limit";
import { curatedRecipeImageUrl } from "@/lib/recipe-image";
import * as images from "@/lib/recipe-images.server";

const RECIPE_COLS =
  "id,name,cuisine,category,meal_type,description,diet_tags,ingredients,steps,image_url,image_source,image_confidence,image_locked,image_signature,image_checked_at";

type ImageResult = {
  imageUrl: string | null;
  source: string | null;
  confidence: number | null;
  searched: boolean;
  reason?: string | null;
  limit?: number | null;
  resetsAt?: string | null;
  premium?: boolean;
};

/** Call only after checking the caller can read the recipe. */
export function requestRecipeImage(userId: string, recipeId: string): Promise<ImageResult> {
  // Coalesce the entire operation, including quota consumption, across both entry points.
  // Every caller is authorized before joining; the initiating user pays for the shared photo.
  return deduplicateAiRequest(
    aiRequestFingerprint("shared", "recipe.image", recipeId),
    async () => {
      const { data: recipe, error } = await firebaseAdmin
        .from("recipes")
        .select(RECIPE_COLS)
        .eq("id", recipeId)
        .maybeSingle();
      if (error) throw error;
      if (!recipe) throw new Error("Recipe not found");
      const curated = curatedRecipeImageUrl(recipe, "hero");
      if (curated) {
        return { imageUrl: curated, source: "Curated", confidence: 100, searched: false };
      }
      const signature = images.recipeSignature(recipe);
      if (recipe.image_url && !images.needsSearch(recipe, signature)) {
        return {
          imageUrl: recipe.image_source ? recipe.image_url : null,
          source: recipe.image_source ?? null,
          confidence: recipe.image_confidence ?? null,
          searched: false,
        };
      }
      await enforceAiRateLimit("ai_image", userId, 5);
      const { data: credit, error: creditError } = await firebaseAdmin.rpc("consume_image_credit", {
        _user_id: userId,
      });
      if (creditError) throw creditError;
      if (!credit?.allowed) {
        return {
          imageUrl: null,
          source: null,
          confidence: null,
          searched: false,
          reason: "limit",
          limit: credit?.max ?? null,
          resetsAt: credit?.resets_at ?? null,
          premium: !!credit?.premium,
        };
      }
      try {
        const imageUrl = await images.generateAndSaveAiImage(recipe, signature);
        if (!imageUrl) throw new Error("No image was generated.");
        return { imageUrl, source: "AI", confidence: 100, searched: true };
      } catch (error) {
        // A failed attempt must remain retryable. Only save successful image metadata.
        if (images.configuredProviders().length === 0) throw error;
        const result = await images.findBestImage(recipe);
        if (!result.best || !result.query) throw error;
        await images.saveImage(recipeId, result.best, result.query, { signature });
        return {
          imageUrl: result.best.url,
          source: result.best.provider,
          confidence: result.best.score ?? null,
          searched: true,
        };
      }
    },
  );
}
