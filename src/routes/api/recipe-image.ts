import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RecipeIdSchema } from "@/lib/recipe-id";
import { authenticateApiRequest } from "@/server/authenticated-api";
import { requestRecipeImage } from "@/lib/recipe-image-request.server";

const InputSchema = z.object({ recipeId: RecipeIdSchema });

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
  const providerError = error instanceof Error && error.message.startsWith("MealMate AI ");
  return Response.json(
    {
      error: providerError
        ? error.message
        : "Couldn't generate this recipe image. Please try again.",
    },
    { status: providerError ? 503 : 502 },
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

        try {
          const { data: accessible, error: accessError } = await auth.user.firebase
            .from("recipes")
            .select("id")
            .eq("id", input.recipeId)
            .maybeSingle();
          if (accessError || !accessible) {
            return Response.json({ error: "Recipe not found." }, { status: 404 });
          }

          return Response.json(await requestRecipeImage(auth.user.userId, input.recipeId));
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
