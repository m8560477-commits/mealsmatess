import { useQuery } from "@tanstack/react-query";
import { listFeatureFlags } from "@/lib/feature-flags.functions";

export function useFeatureFlags() {
  return useQuery({
    queryKey: ["feature-flags"],
    queryFn: () => listFeatureFlags(),
    staleTime: 60_000,
  });
}

export function useFeatureFlag(key: string, fallback = false): boolean {
  const { data } = useFeatureFlags();
  const flag = data?.find((f) => f.key === key);
  if (!flag) return fallback;
  return !!flag.enabled;
}
