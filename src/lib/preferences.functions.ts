import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePreferences, type FoodPreferences } from "@/lib/preferences";

const prefsSchema = z.object({
  goal: z.string().max(60).nullable().default(null),
  favorite_foods: z.array(z.string().max(60)).max(30).default([]),
  allergies: z.array(z.string().max(60)).max(40).default([]),
  dietary_restrictions: z.array(z.string().max(60)).max(30).default([]),
  disliked_foods: z.array(z.string().max(60)).max(40).default([]),
  meals_per_day: z.string().max(40).nullable().default(null),
  cooking_level: z.string().max(40).nullable().default(null),
  cooking_time: z.string().max(40).nullable().default(null),
  food_budget: z.string().max(40).nullable().default(null),
  preferred_features: z.array(z.string().max(40)).max(20).default([]),
  onboarding_completed: z.boolean().default(false),
});

export const getMyPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FoodPreferences | null> => {
    const { data } = await context.supabase
      .from("profiles")
      .select("preferences, onboarding_completed")
      .eq("id", context.userId)
      .maybeSingle();
    if (!data) return null;
    const prefs = normalizePreferences(data.preferences);
    return { ...prefs, onboarding_completed: Boolean(data.onboarding_completed) };
  });

export const saveMyPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => prefsSchema.parse(v))
  .handler(async ({ data, context }) => {
    const payload = { ...data, updated_at: new Date().toISOString() };
    const { error } = await context.supabase
      .from("profiles")
      .upsert(
        {
          id: context.userId,
          preferences: payload,
          onboarding_completed: data.onboarding_completed,
        },
        { onConflict: "id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
