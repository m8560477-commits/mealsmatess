import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrderRealtime } from "@/lib/marketplace.realtime";
import { money, StatusTracker } from "@/components/restaurant/bits";
import { type OrderStatus } from "@/lib/restaurants.schemas";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/order/$id")({
  head: () => ({
    meta: [
      { title: "Order tracking | MealMate" },
      {
        name: "description",
        content: "Follow your MealMate order from the kitchen to your door with live status updates.",
      },
      { property: "og:title", content: "Order tracking | MealMate" },
      { property: "og:description", content: "Live status updates for your MealMate order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderPage,
});

function OrderPage() {
  const { id } = Route.useParams();
  useOrderRealtime(id);
  const { data, isLoading } = useQuery({
    queryKey: ["order", id],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_orders")
        .select(
          "id,status,subtotal,delivery_fee,total,currency,placed_at,delivery_address,contact_phone,notes,restaurants(name,slug),order_items(id,name,quantity,unit_price)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-3 px-4 py-6">
        <Skeleton className="h-8 w-48 rounded-full" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <h1 className="font-display text-2xl">Order not found</h1>
        <Button asChild className="rounded-full">
          <Link to="/orders">My orders</Link>
        </Button>
      </main>
    );
  }

  const restaurant = data.restaurants as { name: string; slug: string } | null;
  const items = (data.order_items ?? []) as {
    id: string;
    name: string;
    quantity: number;
    unit_price: number;
  }[];

  return (
    <div className="page-enter mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <header>
        <h1 className="font-display text-2xl">{restaurant?.name ?? "Your order"}</h1>
        <p className="text-xs text-muted-foreground">
          Placed {new Date(data.placed_at).toLocaleString()}
        </p>
      </header>

      <section className="md3-surface rounded-3xl border border-border/60 bg-card p-4">
        <StatusTracker status={data.status as OrderStatus} />
      </section>

      <section className="md3-surface rounded-3xl border border-border/60 bg-card p-4">
        <h2 className="text-sm font-semibold">Items</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((it) => (
            <li key={it.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">
                {it.quantity} × {it.name}
              </span>
              <span>{money(it.unit_price * it.quantity, data.currency)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-border/60 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>{money(data.subtotal, data.currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery</dt>
            <dd>{money(data.delivery_fee, data.currency)}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>Total</dt>
            <dd>{money(data.total, data.currency)}</dd>
          </div>
        </dl>
      </section>

      {(data.delivery_address || data.contact_phone) && (
        <section className="md3-surface rounded-3xl border border-border/60 bg-card p-4 text-sm">
          <h2 className="text-sm font-semibold">Delivery</h2>
          {data.delivery_address && <p className="mt-2">{data.delivery_address}</p>}
          {data.contact_phone && <p className="text-muted-foreground">{data.contact_phone}</p>}
          {data.notes && <p className="mt-2 text-muted-foreground">Notes: {data.notes}</p>}
        </section>
      )}

      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link to="/orders">All orders</Link>
        </Button>
        <Button asChild size="sm" className="rounded-full">
          <Link to="/restaurants">Order again</Link>
        </Button>
      </div>
    </div>
  );
}
