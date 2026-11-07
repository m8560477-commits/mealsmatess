import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { getMyUsage } from "@/lib/premium.functions";

import { verifyMyPremium } from "@/lib/billing.functions";
import { useEffect, useState } from "react";

export function usePremium() {
  const { user } = useSession();
  const [now, setNow] = useState(Date.now);
  const query = useQuery({
    queryKey: ["entitlement", user?.id ?? "anon"],
    queryFn: () => verifyMyPremium(),
    enabled: !!user,
    staleTime: 15_000,
    refetchOnMount: true,
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
    retry: false,
  });
  const verifiedUntil = query.data?.verifiedUntil ?? 0;
  useEffect(() => {
    if (verifiedUntil <= Date.now()) return;
    // Re-render at lease expiry rather than waking every component every second.
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(verifiedUntil - Date.now() + 1, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [verifiedUntil]);
  return {
    isPremium:
      !!user &&
      !query.isError &&
      !!query.data?.isPremium &&
      query.data.verifiedUntil > Math.max(now, Date.now()),
    tier: query.data?.tier ?? "free",
    trialActive: query.data?.trialActive ?? false,
    entitlement: query.data,
    loading: !!user && query.isPending,
    error: query.error,
    retry: query.refetch,
  };
}

export function useUsage() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["usage", user?.id ?? "anon"],
    queryFn: () => getMyUsage(),
    enabled: !!user,
    staleTime: 10_000,
  });
}
