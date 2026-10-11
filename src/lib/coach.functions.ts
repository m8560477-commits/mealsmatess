import { createServerFn } from "@tanstack/react-start";
import { lovableFetch } from "@/lib/lovable-ai.server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit, trackEvent } from "@/lib/security.server";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const InputSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(30),
});

type Profile = {
  display_name: string | null;
  dietary_preferences: string[] | null;
  goal: string | null;
  activity_level: string | null;
  allergies: string[] | null;
  budget_per_day: number | null;
  age: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  family_size: number | null;
  currency: string | null;
};

function profileSummary(p: Profile | null): string {
  if (!p) return "No profile on file yet — ask the user for their goal, allergies, and any dietary preferences before giving specific numbers.";
  const bits: string[] = [];
  if (p.display_name) bits.push(`Name: ${p.display_name}`);
  if (p.age) bits.push(`Age: ${p.age}`);
  if (p.weight_kg) bits.push(`Weight: ${p.weight_kg} kg`);
  if (p.height_cm) bits.push(`Height: ${p.height_cm} cm`);
  if (p.goal) bits.push(`Goal: ${p.goal}`);
  if (p.activity_level) bits.push(`Activity: ${p.activity_level}`);
  if (p.family_size && p.family_size > 1) bits.push(`Cooks for: ${p.family_size} people`);
  if (p.budget_per_day) bits.push(`Daily food budget: ${p.budget_per_day} ${p.currency ?? "USD"}`);
  if (p.dietary_preferences?.length) bits.push(`Diet: ${p.dietary_preferences.join(", ")}`);
  if (p.allergies?.length) bits.push(`Allergies / avoid: ${p.allergies.join(", ")}`);
  return bits.length ? bits.join("\n") : "Profile exists but has no health details filled in.";
}

const SYSTEM = (summary: string) => `You are MealMate's AI Nutrition Coach — a warm, evidence-based coach (think dietitian, not a doctor). You give personalized, practical advice tailored to the user's profile below.

USER PROFILE:
${summary}

RULES:
- Personalize every answer to THIS user's profile. Reference their goal, allergies, and constraints explicitly.
- Never suggest anything on their allergy or avoid list. Offer clear substitutions instead.
- If they ask for calorie/macro targets and their weight/height/age/activity are known, estimate TDEE using Mifflin-St Jeor and adjust for their goal (-500 kcal for fat loss, +250-500 for muscle gain, maintenance otherwise). Show your math briefly.
- If profile data is missing for a specific calculation, ask ONE targeted question first.
- Be concrete: give foods, portion sizes, timing, budget-friendly swaps. Prefer whole foods.
- Keep answers scannable — short paragraphs and bullet lists. No medical claims. No "consult a doctor" disclaimers unless the topic is truly medical (medication, disease, pregnancy).
- Plain markdown only. No headings above H3.`;

async function callChat(messages: { role: string; content: string }[]): Promise<string> {
  const res = await lovableFetch("/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { choices: { message: { content: string } }[] };
  return j.choices?.[0]?.message?.content ?? "";
}

export const nutritionCoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => InputSchema.parse(v))
  .handler(async ({ data, context }) => {
    await enforceRateLimit("ai_chat", context.userId, 20);
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "display_name,dietary_preferences,goal,activity_level,allergies,budget_per_day,age,weight_kg,height_cm,family_size,currency",
      )
      .eq("id", userId)
      .maybeSingle();

    const summary = profileSummary(profile as Profile | null);
    const t0 = Date.now();
    try {
      const answer = await callChat([
        { role: "system", content: SYSTEM(summary) },
        ...data.messages,
      ]);
      void trackEvent({
        user_id: userId,
        kind: "ai",
        name: "ai.nutrition_coach",
        latency_ms: Date.now() - t0,
        success: true,
        metadata: { turns: data.messages.length, a_len: answer.length },
      });
      return { answer };
    } catch (e) {
      void trackEvent({
        user_id: userId,
        kind: "ai",
        name: "ai.nutrition_coach",
        latency_ms: Date.now() - t0,
        success: false,
        error: e instanceof Error ? e.message.slice(0, 500) : String(e),
      });
      throw e;
    }
  });

export const getCoachContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select(
        "display_name,goal,activity_level,allergies,dietary_preferences,budget_per_day,age,weight_kg,height_cm,family_size,currency",
      )
      .eq("id", context.userId)
      .maybeSingle();
    const p = (profile as Profile | null) ?? null;
    const missing: string[] = [];
    if (!p?.goal) missing.push("goal");
    if (!p?.weight_kg) missing.push("weight");
    if (!p?.height_cm) missing.push("height");
    if (!p?.age) missing.push("age");
    if (!p?.activity_level) missing.push("activity level");
    return { profile: p, missing };
  });
