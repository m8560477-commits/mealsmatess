import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Megaphone, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePremium } from "@/hooks/use-premium";
import { cn } from "@/lib/utils";

export type AdSlotName = "home_feed" | "recipes" | "restaurants" | "planner" | "grocery";

type Placement = {
  id: string;
  slot: string;
  title: string;
  body: string | null;
  image_url: string | null;
  cta_label: string | null;
  target_url: string | null;
  advertiser: string | null;
  weight: number;
  starts_at: string | null;
  ends_at: string | null;
};

/** Remotely managed sponsored placements — controlled from the ad_placements table. */
export function adPlacementsQuery(slot: AdSlotName) {
  return {
    queryKey: ["ad-placements", slot],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Placement[]> => {
      const { data, error } = await supabase
        .from("ad_placements")
        .select(
          "id, slot, title, body, image_url, cta_label, target_url, advertiser, weight, starts_at, ends_at",
        )
        .eq("slot", slot)
        .eq("is_active", true)
        .limit(10);
      if (error) throw error;
      const now = Date.now();
      return (data ?? []).filter(
        (p) =>
          (!p.starts_at || new Date(p.starts_at).getTime() <= now) &&
          (!p.ends_at || new Date(p.ends_at).getTime() >= now),
      );
    },
  };
}

/**
 * Tasteful in-feed sponsored card. Renders nothing for Premium members,
 * while their entitlement is still being checked, or when no placement is live.
 */
export function AdSlot({ slot, className }: { slot: AdSlotName; className?: string }) {
  const { isPremium, loading } = usePremium();
  const { data } = useQuery({ ...adPlacementsQuery(slot), enabled: !isPremium });

  const ad = useMemo(() => {
    if (!data?.length) return null;
    const pool = data.flatMap((p) => Array<Placement>(Math.max(1, Math.min(p.weight, 5))).fill(p));
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }, [data]);

  if (loading || isPremium || !ad) return null;

  const inner = (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border/70 bg-card/70 p-3 transition-colors hover:bg-card",
        className,
      )}
    >
      {ad.image_url ? (
        <img
          src={ad.image_url}
          alt=""
          loading="lazy"
          className="h-14 w-14 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Megaphone className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Sponsored{ad.advertiser ? ` · ${ad.advertiser}` : ""}
        </p>
        <p className="truncate text-sm font-semibold text-foreground">{ad.title}</p>
        {ad.body && <p className="line-clamp-2 text-xs text-muted-foreground">{ad.body}</p>}
      </div>
      {ad.cta_label && (
        <span className="flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
          {ad.cta_label}
          <ExternalLink className="h-3 w-3" />
        </span>
      )}
    </div>
  );

  const href = ad.target_url ?? "";
  if (href.startsWith("http")) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer sponsored" aria-label={`Sponsored: ${ad.title}`}>
        {inner}
      </a>
    );
  }
  if (href.startsWith("/")) {
    return (
      <Link to={href} aria-label={`Sponsored: ${ad.title}`}>
        {inner}
      </Link>
    );
  }
  return inner;
}
