import { createServerFn } from "@tanstack/react-start";
import { lovableFetch } from "@/lib/lovable-ai.server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("No JSON in response");
  return JSON.parse(cleaned.slice(s, e + 1));
}

const ScriptSchema = z.object({
  title: z.string(),
  kind: z.enum(["educational", "business", "creative"]).default("educational"),
  summary: z.string(),
  style_note: z.string().default(""),
  scenes: z
    .array(
      z.object({
        heading: z.string(),
        narration: z.string(),
        subtitle: z.string().default(""),
        image_prompt: z.string(),
      }),
    )
    .min(1),
});

async function b64Image(key: string, prompt: string): Promise<string | null> {
  try {
    const res = await lovableFetch(`/images/generations`, {
      method: "POST",
      body: JSON.stringify({
        model: "openai/gpt-image-2",
        prompt,
        quality: "low",
        size: "1024x1024",
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const item = j.data?.[0];
    if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
    return item?.url ?? null;
  } catch {
    return null;
  }
}

async function b64Speech(key: string, text: string): Promise<string | null> {
  try {
    const res = await lovableFetch(`/audio/speech`, {
      method: "POST",
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: text,
        voice: "alloy",
        response_format: "mp3",
        instructions: "Warm, clear, documentary narrator pace.",
      }),
    });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i += 0x8000) {
      binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    }
    return `data:audio/mpeg;base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

/**
 * Premium AI Visual Mode — turns any prompt into an animated, narrated
 * visual explanation (scene script + AI illustrations + voice narration).
 */
export const generateVisualExplanation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => VisualInput.parse(v))
  .handler(async ({ data, context }): Promise<VisualExplanation> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("tier,status,period_end")
      .eq("user_id", context.userId)
      .in("status", ["trialing", "active", "in_grace"])
      .order("period_end", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const isPremium =
      !!sub &&
      (sub.tier === "lifetime" || !sub.period_end || new Date(sub.period_end).getTime() > Date.now());
    if (!isPremium) throw new Error("Visual Mode is a Premium feature");

    await enforceRateLimit("ai_visual", context.userId, 15);


    const t0 = Date.now();
    try {
      const res = await lovableFetch(`/chat/completions`, {
        method: "POST",
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `You are a motion-design director and explainer scriptwriter.
Classify the prompt as "educational" (step-by-step lesson), "business" (clean presentation-style) or "creative" (cinematic motion graphics), then write a short animated video script.
Return ONLY JSON:
{"title":string,"kind":"educational"|"business"|"creative","summary":string (2-3 sentences),"style_note":string,
"scenes":[{"heading":string (max 6 words),"narration":string (1-2 spoken sentences, ~18 words),"subtitle":string (short on-screen caption),"image_prompt":string (detailed art direction, consistent visual style across scenes, no text in image)}]}
Exactly ${data.scenes} scenes, each ~5 seconds of narration, together forming a 15-30s video.`,
            },
            { role: "user", content: data.prompt },
          ],
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const j = (await res.json()) as { choices: { message: { content: string } }[] };
      const script = ScriptSchema.parse(extractJson(j.choices?.[0]?.message?.content ?? "{}"));

      const styleSuffix =
        script.kind === "business"
          ? "clean corporate infographic illustration, flat vector, generous negative space, muted professional palette"
          : script.kind === "creative"
            ? "cinematic concept art, dramatic lighting, rich colour grading, film still"
            : "friendly educational diagram illustration, clear labelled shapes, bright cohesive palette, flat vector";

      const scenes = await Promise.all(
        script.scenes.slice(0, data.scenes).map(async (s) => {
          const [imageUrl, audioUrl] = await Promise.all([
            b64Image("", `${s.image_prompt}. ${styleSuffix}. No words or lettering in the image.`),
            data.narration ? b64Speech("", s.narration) : Promise.resolve(null),
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
