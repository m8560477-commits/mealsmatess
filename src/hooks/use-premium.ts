import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { getMyEntitlement, getMyUsage, refreshMyEntitlement } from "@/lib/premium.functions";
import { Capacitor } from "@capacitor/core";

export function usePremium() {
  const { user } = useSession();
  const query = useQuery({
    queryKey: ["entitlement", user?.id ?? "anon"],
    queryFn: () => getMyEntitlement(),
    enabled: !!user,
    staleTime: 30000,
    refetchOnWindowFocus: "always",
    refetchInterval: 60000,
    retry: 1,
  });
  return {
    isPremium: !query.isError && (query.data?.isPremium ?? false),
    tier: query.data?.tier ?? "none",
    trialActive: query.data?.trialActive ?? false,
    entitlement: query.isError ? undefined : query.data,
    loading: query.isLoading,
    error: query.error,
  };
}
export function EntitlementLifecycle() {
  const { user } = useSession();
  const qc = useQueryClient();
  const id = user?.id;
  useEffect(() => {
    if (!id) return;
    let active = true;
    let last = 0;
    const refresh = async () => {
      if (Date.now() - last < 30000) return;
      last = Date.now();
      try {
        const value = await refreshMyEntitlement();
        if (active) qc.setQueryData(["entitlement", id], value);
      } catch {
        if (active) {
          qc.removeQueries({ queryKey: ["entitlement", id] });
          await qc.invalidateQueries({ queryKey: ["entitlement", id] });
        }
      }
    };
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    const listener = Capacitor.isNativePlatform()
      ? import("@capacitor/app").then(({ App }) =>
          App.addListener("resume", () => {
            void refresh();
          }),
        )
      : null;
    return () => {
      active = false;
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
      void listener?.then((handle) => handle.remove());
    };
  }, [id, qc]);
  return null;
}
export function useUsage() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["usage", user?.id ?? "anon"],
    queryFn: () => getMyUsage(),
    enabled: !!user,
    staleTime: 10000,
  });
}
