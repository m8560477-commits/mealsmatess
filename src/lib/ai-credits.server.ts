// Server-only: consumes one Mia AI request against the user's plan allowance.
// The counting happens atomically in the database (consume_ai_credit), so the
// limit cannot be bypassed by refreshing, reinstalling or editing app state.

export class AiLimitError extends Error {
  constructor(
    public reason: "daily" | "monthly",
    public resetsAt: string | null,
  ) {
    const when = resetsAt
      ? new Date(resetsAt).toLocaleString("en-ZA", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        }) + " UTC"
      : "soon";
    super(
      reason === "daily"
        ? `MEALMATE_LIMIT_AI_DAILY: You've used today's Mia AI allowance. It resets ${when}. Upgrade to MealMate Premium for more.`
        : `MEALMATE_LIMIT_AI_MONTHLY: You've used this month's Mia AI allowance. It resets ${when}. Upgrade to MealMate Premium for more.`,
    );
  }
}

export async function requireAiCredit(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("consume_ai_credit", { _user_id: userId });
  if (error) throw new Error(`Could not check your Mia AI allowance: ${error.message}`);
  const r = data as { allowed: boolean; reason?: "daily" | "monthly"; resets_at?: string } | null;
  if (!r?.allowed) throw new AiLimitError(r?.reason ?? "daily", r?.resets_at ?? null);
}
