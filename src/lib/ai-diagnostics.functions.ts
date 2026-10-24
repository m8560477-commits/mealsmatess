import { randomUUID } from "node:crypto";
import { deleteRecipePhoto, uploadRecipePhoto } from "@/lib/recipe-photo-storage.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { loadFirebaseAdmin } from "@/lib/firebase-admin-access";
import { enforceRateLimit } from "@/lib/security.server";
import {
  generateAiImage,
  generateAiObject,
  generateAiText,
  getAiProviderConfiguration,
} from "@/lib/ai-engine.server";

const DiagnosticSchema = z.object({
  test: z.enum(["backend", "recipe", "mia", "gateway", "image", "database", "storage", "security"]),
});

function safeFailure(error: unknown) {
  if (error instanceof Response && error.status === 429)
    return "Rate limiting rejected the repeated request as expected.";
  const message = error instanceof Error ? error.message : "";
  if (/Blob|photo storage/i.test(message))
    return "Vercel Blob storage is unavailable. Check the connected public store and deployment configuration.";
  if (/FIREBASE_SERVICE_ACCOUNT_JSON|Firebase Admin is not configured/i.test(message))
    return "Firebase Admin is not configured for this server runtime.";
  if (/credit|billing|payment/i.test(message))
    return "The AI provider needs active billing or credits before it can process this test.";
  if (/LOVABLE_API_KEY|AI_GATEWAY_API_KEY|not configured/i.test(message))
    return "The AI Gateway is not available in this server environment.";
  if (/authentication|unauthorized|rejected.*key/i.test(message))
    return "AI Gateway authentication failed. Check the server side provider credentials.";
  if (/timeout|timed out/i.test(message)) return "The test timed out before the service responded.";
  return "The server side diagnostic failed. Check server logs for the test name and failure category.";
}

async function checkDatabase(userId: string) {
  const { firebaseAdmin } = await loadFirebaseAdmin();
  const id = `ai-diagnostic-${randomUUID()}`;
  const { error: insertError } = await firebaseAdmin.from("grocery_items").insert({
    id,
    user_id: userId,
    name: id,
    quantity: "1",
    category: "Other",
    checked: true,
  });
  if (insertError) throw insertError;
  let readFailed = false;
  let readFailure: unknown;
  try {
    const { data, error } = await firebaseAdmin
      .from("grocery_items")
      .select("id,user_id,name")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.user_id !== userId)
      throw new Error("Scoped database read after write failed.");
  } catch (error) {
    readFailed = true;
    readFailure = error;
  }

  const { error: cleanupError } = await firebaseAdmin
    .from("grocery_items")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (cleanupError) throw cleanupError;
  if (readFailed) throw readFailure;
  return "User scoped database insert, read, and cleanup succeeded.";
}

async function checkStorage() {
  const path = `diagnostics/${randomUUID()}.png`;
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a7sAAAAASUVORK5CYII=",
    "base64",
  );
  let imageUrl: string | undefined;
  let verificationFailed = false;
  let verificationFailure: unknown;
  try {
    imageUrl = await uploadRecipePhoto(path, bytes, "image/png");
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(bytes)) {
      throw new Error("Stored image could not be retrieved correctly.");
    }
  } catch (error) {
    verificationFailed = true;
    verificationFailure = error;
  }

  let cleanupError: Error | null = null;
  if (imageUrl) {
    try {
      await deleteRecipePhoto(imageUrl);
    } catch (error) {
      cleanupError = error instanceof Error ? error : new Error(String(error));
    }
  }
  if (verificationFailed && cleanupError) {
    throw new AggregateError(
      [verificationFailure, cleanupError],
      "Storage verification and cleanup failed.",
    );
  }
  if (cleanupError) throw cleanupError;
  if (verificationFailed) throw verificationFailure;
  return "Vercel Blob upload, public image retrieval, and cleanup succeeded.";
}

export const runAiDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((value: unknown) => DiagnosticSchema.parse(value))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await import("@/lib/marketplace.server");
    if (!(await isAdmin(context.userId))) throw new Error("Admin access required.");
    const config = getAiProviderConfiguration();
    try {
      switch (data.test) {
        case "backend":
          return {
            test: data.test,
            ok: config.configured,
            detail: config.configured
              ? "Authenticated admin endpoint and AI Gateway configuration are available."
              : "Authenticated admin endpoint is available, but AI Gateway credentials are not loaded in this server runtime.",
            ...config,
          };
        case "recipe": {
          const recipe = await generateAiObject({
            feature: "diagnostics.recipe",
            instructions: "Return an original breakfast recipe. Nutrition is approximate.",
            prompt:
              "Create a simple breakfast using eggs, tomatoes, and bread. Include quantities and four steps.",
            schema: z.object({
              name: z.string().min(2),
              ingredients: z
                .array(z.object({ name: z.string().min(1), quantity: z.string().min(1) }))
                .min(3),
              steps: z.array(z.string().min(1)).min(4),
            }),
          });
          return {
            test: data.test,
            ok: true,
            model: config.textModel,
            detail: `Validated ${recipe.name} (${recipe.ingredients.length} ingredients, ${recipe.steps.length} steps).`,
          };
        }
        case "mia": {
          const answer = await generateAiText({
            feature: "diagnostics.mia",
            instructions: "You are MealMate's kitchen assistant. Answer accurately and concisely.",
            prompt: "What is one practical non-dairy substitute for buttermilk in pancakes?",
          });
          return {
            test: data.test,
            ok: answer.length > 0,
            model: config.textModel,
            detail: answer.slice(0, 240),
          };
        }
        case "gateway": {
          const answer = await generateAiText({
            feature: "diagnostics.gateway",
            prompt: "Reply with exactly: MealMate AI is connected.",
          });
          return {
            test: data.test,
            ok: answer.length > 0,
            provider: config.textProvider,
            model: config.textModel,
            detail: answer.slice(0, 160),
          };
        }
        case "image": {
          const image = await generateAiImage(
            "Photorealistic tomato and herb omelet with golden toast, natural light, no text or people.",
            { feature: "diagnostics.image", size: "1024x1024" },
          );
          return {
            test: data.test,
            ok: image.bytes.byteLength > 0,
            model: image.model,
            detail: `Generated ${image.mediaType} (${image.bytes.byteLength} bytes).`,
          };
        }
        case "database":
          return { test: data.test, ok: true, detail: await checkDatabase(context.userId) };
        case "storage":
          return { test: data.test, ok: true, detail: await checkStorage() };
        case "security": {
          const id = `diagnostics:${context.userId}:${randomUUID()}`;
          await enforceRateLimit("ai_diagnostics", id, 1);
          let blocked = false;
          try {
            await enforceRateLimit("ai_diagnostics", id, 1);
          } catch (error) {
            blocked = error instanceof Response && error.status === 429;
          }
          if (!blocked) throw new Error("Rate limiter did not reject the repeated request.");
          return {
            test: data.test,
            ok: true,
            detail:
              "Firebase authentication and admin authorization passed; repeat requests are rate limited.",
          };
        }
      }
    } catch (error) {
      console.error("[MealMate diagnostics] test failed", {
        test: data.test,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return { test: data.test, ok: false, detail: safeFailure(error) };
    }
  });
