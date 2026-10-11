import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star, Clock, Bike, Phone, MapPin, Minus, Plus, ShoppingBag } from "lucide-react";
import {
  restaurantBySlugQuery,
  restaurantMenuQuery,
  restaurantReviewsQuery,
} from "@/lib/restaurant-queries";
import { useRestaurantRealtime } from "@/lib/marketplace.realtime";
import { useCart } from "@/lib/cart";
import { money, OpenBadge } from "@/components/restaurant/bits";
import { formatDistance, haversineKm, useUserLocation } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/restaurant/$slug")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(restaurantBySlugQuery(params.slug)),
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug.replace(/-/g, " ")} | MealMate Restaurants` },
      {
        name: "description",
        content: `Browse the menu, delivery details and reviews for this MealMate partner restaurant, then order in a few taps.`,
      },
      { property: "og:title", content: `${params.slug.replace(/-/g, " ")} | MealMate` },
      {
        property: "og:description",
        content: "Menu, delivery info and live order tracking on MealMate.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="text-sm text-muted-foreground">We couldn't load this restaurant.</p>
      <Button asChild className="mt-4 rounded-full">
        <Link to="/restaurants">Back to restaurants</Link>
      </Button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="text-sm text-muted-foreground">Restaurant not found.</p>
    </div>
  ),
  component: RestaurantPage,
});

function RestaurantPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { data: restaurant, isLoading } = useQuery(restaurantBySlugQuery(slug));
  const { data: menu } = useQuery(restaurantMenuQuery(restaurant?.id));
  const { data: reviews } = useQuery(restaurantReviewsQuery(restaurant?.id));
  useRestaurantRealtime(restaurant?.id, slug);
  const { cart, addItem, setQuantity, subtotal, count } = useCart();
  const { coords } = useUserLocation();

  const distance = useMemo(() => {
    const loc = restaurant?.restaurant_locations?.[0];
    return coords && loc ? haversineKm(coords, loc) : null;
  }, [coords, restaurant]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof menu>();
    for (const item of menu ?? []) {
      const key = item.category?.trim() || "Menu";
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()];
  }, [menu]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-28 pt-4">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <Skeleton className="mt-4 h-8 w-2/3" />
        <Skeleton className="mt-6 h-24 w-full rounded-2xl" />
      </div>
    );
  }
  if (!restaurant) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-sm text-muted-foreground">Restaurant not found.</p>
        <Button asChild className="mt-4 rounded-full">
          <Link to="/restaurants">Back to restaurants</Link>
        </Button>
      </div>
    );
  }

  const cartLine = (id: string) =>
    cart?.restaurant_id === restaurant.id
      ? cart.lines.find((l) => l.menu_item_id === id)?.quantity ?? 0
      : 0;

  return (
    <div className="page-enter mx-auto max-w-3xl pb-32">
      <div className="relative h-44 w-full overflow-hidden bg-muted sm:rounded-b-3xl">
        {restaurant.cover_image_url ? (
          <img
            src={restaurant.cover_image_url}
            alt={`${restaurant.name} cover photo`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-5xl">🍽️</div>
        )}
      </div>

      <div className="px-4">
        <div className="md3-surface -mt-10 rounded-3xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-start gap-3">
            {restaurant.logo_url && (
              <img
                src={restaurant.logo_url}
                alt={`${restaurant.name} logo`}
                className="h-14 w-14 rounded-2xl object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold tracking-tight">{restaurant.name}</h1>
              <p className="text-xs text-muted-foreground">
                {[restaurant.cuisine, restaurant.price_range].filter(Boolean).join(" · ")}
              </p>
            </div>
            <OpenBadge hours={restaurant.opening_hours} />
          </div>

          {restaurant.description && (
            <p className="mt-3 text-sm text-muted-foreground">{restaurant.description}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {Number(restaurant.avg_rating).toFixed(1)} ({restaurant.rating_count})
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {restaurant.delivery_estimate_minutes} min
            </span>
            <span className="flex items-center gap-1">
              <Bike className="h-3.5 w-3.5" />
              {Number(restaurant.delivery_fee) === 0
                ? "Free delivery"
                : money(restaurant.delivery_fee, restaurant.currency)}
            </span>
            {distance != null && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {formatDistance(distance)}
              </span>
            )}
            {restaurant.phone && (
              <a href={`tel:${restaurant.phone}`} className="flex items-center gap-1 underline">
                <Phone className="h-3.5 w-3.5" />
                {restaurant.phone}
              </a>
            )}
          </div>

          {Number(restaurant.min_order_amount) > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Minimum order {money(restaurant.min_order_amount, restaurant.currency)}
            </p>
          )}
          {!restaurant.is_accepting_orders && (
            <Badge variant="secondary" className="mt-3 rounded-full">
              Not accepting orders right now
            </Badge>
          )}
        </div>

        {grouped.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            This restaurant hasn't published its menu yet.
          </p>
        ) : (
          grouped.map(([category, items]) => (
            <section key={category} className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </h2>
              <ul className="space-y-2">
                {(items ?? []).map((item) => {
                  const qty = cartLine(item.id);
                  return (
                    <li
                      key={item.id}
                      className="md3-surface flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3"
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          loading="lazy"
                          className="h-16 w-16 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted text-xl">
                          🍲
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        {item.description && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {item.description}
                          </p>
                        )}
                        <p className="mt-1 text-sm font-semibold">
                          {money(item.price, restaurant.currency)}
                        </p>
                      </div>
                      {!item.is_available ? (
                        <Badge variant="secondary" className="rounded-full">
                          Sold out
                        </Badge>
                      ) : qty > 0 ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 rounded-full"
                            aria-label={`Remove one ${item.name}`}
                            onClick={() => setQuantity(item.id, qty - 1)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-6 text-center text-sm font-semibold">{qty}</span>
                          <Button
                            size="icon"
                            className="h-8 w-8 rounded-full"
                            aria-label={`Add one ${item.name}`}
                            onClick={() => setQuantity(item.id, qty + 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          className="rounded-full"
                          disabled={!restaurant.is_accepting_orders}
                          onClick={() => {
                            const { replaced } = addItem(
                              {
                                restaurant_id: restaurant.id,
                                restaurant_slug: restaurant.slug,
                                restaurant_name: restaurant.name,
                                currency: restaurant.currency,
                                delivery_fee: Number(restaurant.delivery_fee),
                                min_order_amount: Number(restaurant.min_order_amount),
                              },
                              {
                                menu_item_id: item.id,
                                name: item.name,
                                unit_price: Number(item.price),
                                image_url: item.image_url,
                              },
                            );
                            toast.success(`${item.name} added`, {
                              description: replaced
                                ? "Your previous cart from another restaurant was cleared."
                                : undefined,
                            });
                          }}
                        >
                          Add
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}

        {(reviews?.length ?? 0) > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Reviews
            </h2>
            <ul className="space-y-2">
              {(reviews ?? []).map((r) => (
                <li
                  key={r.id}
                  className="md3-surface rounded-2xl border border-border/60 bg-card p-3"
                >
                  <div className="flex items-center gap-1 text-amber-500">
                    {Array.from({ length: r.rating }).map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-current" />
                    ))}
                  </div>
                  {r.comment && <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {count > 0 && cart?.restaurant_id === restaurant.id && (
        <div className="fixed inset-x-0 bottom-16 z-40 px-4">
          <Button
            className="mx-auto flex h-12 w-full max-w-md items-center justify-between rounded-full px-5 shadow-lg"
            onClick={() => navigate({ to: "/checkout" })}
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              {count} item{count > 1 ? "s" : ""}
            </span>
            <span>{money(subtotal, restaurant.currency)} · Checkout</span>
          </Button>
        </div>
      )}
    </div>
  );
}
