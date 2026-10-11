import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { getGamification } from "@/lib/xp.functions";
import { useSession } from "@/hooks/use-session";

/** Compact level pill shown in the home greeting header; links to profile. */
export function XpChip() {
  const { user } = useSession();
  const { data } = useQuery({
    queryKey: ["gamification"],
    queryFn: () => getGamification(),
    enabled: !!user,
    staleTime: 60_000,
  });

  if (!user || !data) return null;

  return (
    <Link
      to="/profile"
      aria-label={`Level ${data.level.level}: ${data.level.name}`}
      className="flex h-9 items-center gap-1 rounded-full bg-primary/10 px-3 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
    >
      <Flame className="h-3.5 w-3.5" />
      Lv {data.level.level}
    </Link>
  );
}
