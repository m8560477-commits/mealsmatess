import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { getMyEntitlement, getMyUsage } from "@/lib/premium.functions";

export function usePremium() {
  const { user } = useSession();
  const query = useQuery({
    queryKey: ["entitlement", user?.id ?? "anon"],
    queryFn: () => getMyEntitlement(),
    enabled: !!user,
    staleTime: 30_000,
  });
  return {
    isPremium: query.data?.isPremium ?? false,
    tier: query.data?.tier ?? "free",
    trialActive: query.data?.trialActive ?? false,
    entitlement: query.data,
    loading: query.isLoading,
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
