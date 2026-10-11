import { Link } from "@tanstack/react-router";
import { Crown, Sparkles, ChefHat, MessageCircleQuestion, Calendar, Check, Zap } from "lucide-react";
import { usePremium, useUsage } from "@/hooks/use-premium";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

const FEATURE_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  ai_chat: { icon: MessageCircleQuestion, label: "AI Chef chats" },
  recipe_gen: { icon: ChefHat, label: "Recipe generations" },
  meal_plan: { icon: Calendar, label: "Meal plans" },
};

const PREMIUM_PERKS = [
  "Unlimited AI recipe generation",
  "Unlimited AI Chef chat",
  "Unlimited food & kitchen scanning",
  "Personalized AI meal plans",
  "Auto grocery lists from your plan",
  "Ingredient substitutions & cooking mode",
  "Advanced nutrition tracking",
  "Priority AI processing · No ads",
];

export function PlanStatusCard() {
  const { user } = useSession();
  const { isPremium, tier, trialActive, entitlement } = usePremium();
  const { data: usage } = useUsage();

  if (!user) {
    return (
      <Link
        to="/auth"
        className="flex items-center justify-between rounded-3xl border border-border bg-card p-4 shadow-sm"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Not signed in</p>
          <p className="mt-0.5 font-display text-lg">Sign in to track your usage</p>
        </div>
        <span className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
          Sign in
        </span>
      </Link>
    );
  }

  if (isPremium) {
    return (
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 p-5 text-white shadow-lg shadow-orange-500/30">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest backdrop-blur">
              <Crown className="h-3 w-3" /> Premium {tier} {trialActive ? "· trial" : ""}
            </span>
            <h3 className="mt-2 font-display text-2xl font-bold leading-tight">
              Unlimited everything ✨
            </h3>
            <p className="mt-1 text-xs text-white/90">
              {entitlement?.periodEnd
                ? `Renews ${new Date(entitlement.periodEnd).toLocaleDateString()}`
                : "Lifetime access"}
            </p>
          </div>
          <Zap className="h-6 w-6 shrink-0 text-white/80" />
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {PREMIUM_PERKS.slice(0, 6).map((p) => (
            <li key={p} className="flex items-center gap-1.5 text-xs text-white/95">
              <Check className="h-3 w-3 shrink-0" /> {p}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const entries = usage
    ? (Object.entries(usage) as [string, { count: number; max: number; period: string; label: string }][])
    : [];

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Free plan</p>
          <h3 className="mt-1 font-display text-xl leading-tight">What's left today</h3>
        </div>
        <Link
          to="/premium"
          className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white shadow-sm"
        >
          <Sparkles className="h-3 w-3" /> Upgrade
        </Link>
      </div>

      <ul className="mt-4 space-y-2.5">
        {entries.length === 0
          ? Object.keys(FEATURE_META).map((k) => (
              <li key={k} className="h-10 animate-pulse rounded-xl bg-muted/60" />
            ))
          : entries.map(([key, u]) => {
              const meta = FEATURE_META[key] ?? { icon: Sparkles, label: u.label };
              const Icon = meta.icon;
              const remaining = Math.max(u.max - u.count, 0);
              const pct = Math.min((u.count / u.max) * 100, 100);
              const outOf = remaining === 0;
              return (
                <li key={key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {meta.label}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        outOf ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
                      )}
                    >
                      {remaining}/{u.max} left · /{u.period}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        outOf
                          ? "bg-rose-500"
                          : pct > 66
                            ? "bg-amber-500"
                            : "bg-primary",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
      </ul>

      <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/40 p-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Premium unlocks
        </p>
        <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {PREMIUM_PERKS.map((p) => (
            <li key={p} className="flex items-start gap-1.5 text-xs">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
