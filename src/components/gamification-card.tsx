import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flame, Trophy, Check, Lock, Gem } from "lucide-react";
import { toast } from "sonner";
import { getGamification, claimElite } from "@/lib/xp.functions";
import { formatXp } from "@/lib/xp";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

/**
 * Full gamification panel for the profile screen: level progress, streaks,
 * active challenges, achievements and the once-ever Elite reward claim.
 */
export function GamificationCard() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["gamification"],
    queryFn: () => getGamification(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const claim = useMutation({
    mutationFn: () => claimElite(),
    onSuccess: (res) => {
      toast.success("Elite reward claimed! 💎", {
        description: `Premium active until ${new Date(res.premiumUntil).toLocaleDateString()}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["gamification"] });
      queryClient.invalidateQueries({ queryKey: ["entitlement"] });
    },
    onError: (err) =>
      toast.error("Couldn't claim the reward", {
        description: err instanceof Error ? err.message : "Try again in a moment.",
      }),
  });

  if (!user) return null;

  if (isLoading || !data) {
    return (
      <div className="space-y-3 rounded-3xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        </div>
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    );
  }

  const { level } = data;

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
      {/* Level header */}
      <div className="flex items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Trophy className="h-8 w-8" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="truncate font-display text-2xl leading-tight">
              {level.emoji} {level.name}
            </h2>
            <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
              {formatXp(data.totalXp)} XP
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: `${Math.round(level.progress * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {level.nextMin
              ? `${formatXp(level.xpToNext)} XP to ${level.nextName}`
              : "Top level reached — legendary!"}
          </p>
        </div>
      </div>

      {/* Streak + totals */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Flame, label: "Day streak", value: String(data.currentStreak) },
          { icon: Trophy, label: "Best streak", value: String(data.longestStreak) },
          { icon: Gem, label: "Total XP", value: formatXp(data.totalXp) },
        ].map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center gap-1 rounded-2xl bg-muted/50 px-2 py-3 text-center"
          >
            <s.icon className="h-4 w-4 text-primary" />
            <span className="font-display text-xl leading-none">{s.value}</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Elite reward */}
      {data.eliteRewardAvailable && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-ember/15 via-primary/10 to-ember/15 p-4">
          <div>
            <p className="text-sm font-bold">Elite reward unlocked</p>
            <p className="text-xs text-muted-foreground">
              50,000 XP earns you 30 days of Premium — once, ever.
            </p>
          </div>
          <Button size="sm" className="rounded-full" disabled={claim.isPending} onClick={() => claim.mutate()}>
            {claim.isPending ? "Claiming…" : "Claim"}
          </Button>
        </div>
      )}

      {/* Challenges */}
      {data.challenges.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Challenges
          </h3>
          <ul className="mt-2 space-y-2">
            {data.challenges.map((c) => {
              const done = !!c.completedAt;
              const pct = Math.min((c.progress / c.goal) * 100, 100);
              return (
                <li
                  key={c.code}
                  className={cn(
                    "rounded-2xl border border-border p-3",
                    done && "border-primary/30 bg-primary/5",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        {done ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                        ) : null}
                        <span className="truncate">{c.title}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{c.description}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-ember/15 px-2 py-0.5 text-[10px] font-bold text-ember">
                      +{c.xpReward} XP
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          done ? "bg-primary" : "bg-ember",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {c.progress}/{c.goal}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Achievements */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Achievements
        </h3>
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {data.achievements.map((a) => (
            <div
              key={a.code}
              title={a.title + (a.unlockedAt ? " — unlocked" : " — " + a.description)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border p-2 text-center",
                a.unlockedAt
                  ? "border-primary/30 bg-primary/5"
                  : "border-border opacity-40 grayscale",
              )}
            >
              {a.unlockedAt ? (
                <span className="text-lg leading-none" aria-hidden>
                  {a.emoji}
                </span>
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="line-clamp-2 text-[9px] font-semibold leading-tight">
                {a.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent XP */}
      {data.recentEvents.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Recent XP
          </h3>
          <ul className="mt-2 space-y-1">
            {data.recentEvents.slice(0, 5).map((e, i) => (
              <li key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{e.label}</span>
                <span className="font-bold text-primary">+{e.points}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
