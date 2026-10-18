import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { enforceAiRateLimit } from "@/server/ai-rate-limit";
import { authenticateApiRequest } from "@/server/authenticated-api";
import { aiRequestFingerprint, deduplicateAiRequest } from "@/lib/ai-engine.server";

const InputSchema = z.object({ recipeId: z.string().uuid() });
const RECIPE_COLS =
  "id,name,cuisine,ingredients,steps,image_url,image_source,image_confidence,image_locked,image_signature,image_checked_at";

function errorResponse(error: unknown) {
  if (error instanceof Response && error.status === 429) {
    return Response.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429 },
    );
  }
  console.error("[Recipe image API] Request failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return Response.json(
    { error: "Couldn't generate this recipe image. Please try again." },
    { status: 502 },
  );
}

export const Route = createFileRoute("/api/recipe-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if ("response" in auth) return auth.response;

        let input: z.infer<typeof InputSchema>;
        try {
          const raw = await request.text();
          if (raw.length > 2_000) {
            return Response.json({ error: "Request is too large." }, { status: 413 });
          }
          input = InputSchema.parse(JSON.parse(raw));
        } catch {
          return Response.json({ error: "Provide a valid recipe." }, { status: 400 });
        }

        if (!process.env["OPENAI_API_KEY"]?.trim()) {
          return Response.json(
            { error: "Recipe image generation is not configured." },
            { status: 503 },
          );
        }

        try {
          const { firebaseAdmin } = await import("@/server/firebase-admin");
          const { data: accessible, error: accessError } = await auth.user.firebase
            .from("recipes")
            .select("id")
            .eq("id", input.recipeId)
            .maybeSingle();
          if (accessError || !accessible) {
            return Response.json({ error: "Recipe not found." }, { status: 404 });
          }

          const { data: recipe, error: recipeError } = await firebaseAdmin
            .from("recipes")
            .select(RECIPE_COLS)
            .eq("id", input.recipeId)
            .maybeSingle();
          if (recipeError || !recipe) {
            return Response.json({ error: "Recipe not found." }, { status: 404 });
          }

          const imageService = await import("@/lib/recipe-images.server");
          const signature = imageService.recipeSignature(recipe);
          if (!imageService.needsSearch(recipe, signature)) {
            return Response.json({
              imageUrl: recipe.image_source ? recipe.image_url : null,
              source: recipe.image_source,
              reason: recipe.image_checked_at ? "already_checked" : null,
            });
          }

          await enforceAiRateLimit("ai_image", auth.user.userId, 5);
          const { data: credit, error: creditError } = await firebaseAdmin.rpc(
            "consume_image_credit",
            { _user_id: auth.user.userId },
          );
          if (creditError) throw new Error("Could not check image allowance");
          const allowance = credit as {
            allowed?: boolean;
            max?: number;
            resets_at?: string;
            premium?: boolean;
          } | null;
          if (allowance?.allowed === false) {
            return Response.json({
              imageUrl: null,
              reason: "limit",
              limit: allowance.max ?? null,
              resetsAt: allowance.resets_at ?? null,
              premium: !!allowance.premium,
            });
          }

          await imageService.markChecked(recipe.id, signature);
          try {
            const imageUrl = await deduplicateAiRequest(
              aiRequestFingerprint(auth.user.userId, "recipe.image", `${recipe.id}:${signature}`),
              () => imageService.generateAndSaveAiImage(recipe, signature),
            );
            if (!imageUrl) throw new Error("No image was generated.");
            return Response.json({ imageUrl, source: "AI", reason: null });
          } catch (error) {
            await firebaseAdmin
              .from("recipes")
              .update({ image_checked_at: null })
              .eq("id", recipe.id);
            throw error;
          }
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
