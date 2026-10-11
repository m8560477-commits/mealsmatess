import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useMyOrdersRealtime } from "@/lib/marketplace.realtime";
import { money } from "@/components/restaurant/bits";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/restaurants.schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "My orders | MealMate" },
      {
        name: "description",
        content: "Track your MealMate restaurant orders, see delivery progress and revisit past meals.",
      },
      { property: "og:title", content: "My orders | MealMate" },
      { property: "og:description", content: "Track and review your MealMate restaurant orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const { user } = useSession();
  useMyOrdersRealtime(user?.id);
  const { data, isLoading } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_orders")
        .select("id,status,total,currency,placed_at,restaurants(name,slug)")
        .order("placed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="page-enter mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="font-display text-2xl">My orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your restaurant orders and their live status.</p>

      {!user ? (
        <div className="md3-surface mt-6 rounded-3xl border border-dashed border-border p-8 text-center">
          <p className="text-sm">Sign in to see your orders.</p>
          <Button asChild size="sm" className="mt-4 rounded-full">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      ) : isLoading ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-3xl" />
          ))}
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="md3-surface mt-6 rounded-3xl border border-dashed border-border p-8 text-center">
          <ShoppingBag className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No orders yet</p>
          <Button asChild size="sm" className="mt-4 rounded-full">
            <Link to="/restaurants">Browse restaurants</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {(data ?? []).map((o) => {
            const restaurant = o.restaurants as { name: string; slug: string } | null;
            return (
              <li key={o.id}>
                <Link
                  to="/order/$id"
                  params={{ id: o.id }}
                  className="md3-surface flex items-center justify-between gap-3 rounded-3xl border border-border/60 bg-card p-4 transition-shadow hover:shadow-lg"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{restaurant?.name ?? "Restaurant"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(o.placed_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary" className="rounded-full">
                      {ORDER_STATUS_LABEL[o.status as OrderStatus]}
                    </Badge>
                    <p className="mt-1 text-sm font-semibold">{money(o.total, o.currency)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
