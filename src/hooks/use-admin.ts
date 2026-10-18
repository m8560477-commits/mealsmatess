import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { adminIsAdmin } from "@/lib/premium.functions";
export function useAdmin() {
  const { user } = useSession();
  const result = useQuery({
    queryKey: ["admin-gate", user?.id],
    queryFn: () => adminIsAdmin(),
    enabled: !!user,
    staleTime: 30000,
    retry: false,
  });
  return !result.isError && result.data?.isAdmin === true;
}
