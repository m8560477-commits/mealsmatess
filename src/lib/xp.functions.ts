import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Client-facing XP surface. xp.server.ts owns the service-role client
 * (xp_events is write-locked for end users by RLS, so XP writes must
 * go through the server).
 */
export const getGamification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { fetchGamification } = await import("@/lib/xp.server");
    return fetchGamification(context.userId);
  });

/**
 * Actions a client is allowed to self-report. premium_purchase is only
 * awarded by the billing webhook, never from the browser. refKey scopes
 * each award to a day (or the entity) so it can't be farmed by spamming.
 */
const CLIENT_ACTIONS = [
  "recipe_cooked",
  "planned_meal_completed",
  "grocery_list_completed",
  "weekly_plan_completed",
] as const;

export const awardXp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        action: z.enum(CLIENT_ACTIONS),
        entityId: z.string().max(120).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { awardXpFor, dayKey } = await import("@/lib/xp.server");
    const refKey = data.entityId
      ? `${data.entityId}:${dayKey()}`
      : `${context.userId}:${dayKey()}`;
    return awardXpFor(supabaseUserId(context.userId), data.action, refKey);
  });

function supabaseUserId(userId: string) {
  return userId;
}

export const claimElite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { claimEliteRewardFor } = await import("@/lib/xp.server");
    return claimEliteRewardFor(context.userId);
  });
