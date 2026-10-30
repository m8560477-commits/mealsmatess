import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { getMyUsage } from "@/lib/premium.functions";

import { verifyMyPremium } from "@/lib/billing.functions";
import { useEffect, useState } from "react";

export function usePremium() {
  const { user } = useSession();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ["entitlement", user?.id ?? "anon"],
    queryFn: () => verifyMyPremium(),
    enabled: !!user,
    staleTime: 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
    retry: false,
  });
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
