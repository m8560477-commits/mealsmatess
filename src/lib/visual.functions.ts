import { createServerFn } from "@tanstack/react-start";
import { requireAiCredit } from "@/lib/ai-credits.server";
import { generateAiImage, generateAiObject, generateAiSpeech } from "@/lib/ai-engine.server";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { loadFirebaseAdmin } from "@/lib/firebase-admin-access";
import { enforceRateLimit, trackEvent } from "@/lib/security.server";

const VisualInput = z.object({
  prompt: z.string().min(3).max(600),
  scenes: z.number().int().min(3).max(6).default(4),
  narration: z.boolean().default(true),
});

export type VisualScene = {
  heading: string;
  narration: string;
  subtitle: string;
  imageUrl: string | null;
  audioUrl: string | null;
  durationMs: number;
};

export type VisualExplanation = {
  title: string;
  kind: "educational" | "business" | "creative";
  summary: string;
  styleNote: string;
  scenes: VisualScene[];
};

const ScriptSchema = z.object({
  title: z.string().trim().min(1).max(160),
  kind: z.enum(["educational", "business", "creative"]).default("educational"),
  summary: z.string().trim().min(1).max(500),
  style_note: z.string().max(300).default(""),
  scenes: z
    .array(
      z.object({
        heading: z.string().trim().min(1).max(80),
        narration: z.string().trim().min(1).max(600),
        subtitle: z.string().max(180).default(""),
        image_prompt: z.string().trim().min(1).max(500),
      }),
    )
    .min(1)
    .max(6),
});

async function b64Image(prompt: string): Promise<string | null> {
  try {
    const image = await generateAiImage(prompt, {
      feature: "visual.image",
      size: "1024x1024",
      timeoutMs: 90_000,
    });
    return `data:${image.mediaType};base64,${Buffer.from(image.bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

async function b64Speech(text: string): Promise<string | null> {
  try {
    const audio = await generateAiSpeech(text, {
      feature: "visual.narration",
    });
    return `data:${audio.mediaType};base64,${Buffer.from(audio.bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Premium AI Visual Mode — turns any prompt into an animated, narrated
 * visual explanation (scene script + AI illustrations + voice narration).
 */
export const generateVisualExplanation = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((v: unknown) => VisualInput.parse(v))
  .handler(async ({ data, context }): Promise<VisualExplanation> => {
    await requireAiCredit(context.userId);
    const { firebaseAdmin } = await loadFirebaseAdmin();
    const { requirePremiumAccess } = await import("@/lib/entitlements.server");
    await requirePremiumAccess(context.userId);

    await enforceRateLimit("ai_visual", context.userId, 15);

    const t0 = Date.now();
    try {
      const script = await generateAiObject({
        feature: "visual.script",
        instructions: `You are a motion-design director and explainer scriptwriter. Classify the prompt as educational, business, or creative, then write a concise, accurate animated explanation. Return exactly ${data.scenes} distinct scenes. Each scene has a short heading, one or two spoken sentences, a concise subtitle, and detailed art direction for an image with no text.`,
        prompt: data.prompt,
        schema: ScriptSchema.extend({ scenes: ScriptSchema.shape.scenes.length(data.scenes) }),
      });

      const styleSuffix =
        script.kind === "business"
          ? "clean corporate infographic illustration, flat vector, generous negative space, muted professional palette"
          : script.kind === "creative"
            ? "cinematic concept art, dramatic lighting, rich colour grading, film still"
            : "friendly educational diagram illustration, clear labelled shapes, bright cohesive palette, flat vector";

      const scenes = await Promise.all(
        script.scenes.slice(0, data.scenes).map(async (s) => {
          const [imageUrl, audioUrl] = await Promise.all([
            b64Image(`${s.image_prompt}. ${styleSuffix}. No words or lettering in the image.`),
            data.narration ? b64Speech(s.narration) : Promise.resolve(null),
          ]);
          return {
            heading: s.heading,
            narration: s.narration,
            subtitle: s.subtitle || s.narration,
            imageUrl,
            audioUrl,
            durationMs: Math.max(4000, Math.min(9000, s.narration.split(/\s+/).length * 380)),
          } satisfies VisualScene;
        }),
      );

      void trackEvent({
        user_id: context.userId,
        kind: "ai",
        name: "ai.visual_explanation",
        latency_ms: Date.now() - t0,
        success: true,
        metadata: { scenes: scenes.length, kind: script.kind },
      });

      return {
        title: script.title,
        kind: script.kind,
        summary: script.summary,
        styleNote: script.style_note,
        scenes,
      };
    } catch (err) {
      void trackEvent({
        user_id: context.userId,
        kind: "ai",
        name: "ai.visual_explanation",
        latency_ms: Date.now() - t0,
        success: false,
        error: err instanceof Error ? err.message.slice(0, 500) : String(err),
      });
      throw err;
    }
  });
