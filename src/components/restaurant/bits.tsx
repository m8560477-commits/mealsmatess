import { Link } from "@tanstack/react-router";
import { Star, MapPin, Clock, BadgeCheck, Bike } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistance, isOpenNow } from "@/lib/geo";
import { ORDER_STATUS_LABEL, TRACKING_STEPS, type OrderStatus } from "@/lib/restaurants.schemas";
import type { PublicRestaurant } from "@/lib/restaurant-queries";

export function money(value: number | string | null | undefined, currency = "ZAR") {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function OpenBadge({ hours }: { hours: unknown }) {
  const open = isOpenNow(hours);
  if (open === null) return null;
  return (
    <Badge variant={open ? "default" : "secondary"} className="rounded-full">
      {open ? "Open now" : "Closed"}
    </Badge>
  );
}

export function RestaurantCard({
  restaurant,
  distanceKm,
}: {
  restaurant: PublicRestaurant;
  distanceKm?: number | null;
}) {
  return (
    <Link
      to="/restaurant/$slug"
      params={{ slug: restaurant.slug }}
      className="md3-surface group block overflow-hidden rounded-3xl border border-border/60 bg-card transition-shadow hover:shadow-lg"
    >
      <div className="relative h-36 w-full overflow-hidden bg-muted">
        {restaurant.cover_image_url ? (
          <img
            src={restaurant.cover_image_url}
            alt={`${restaurant.name} cover`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl">🍽️</div>
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          <OpenBadge hours={restaurant.opening_hours} />
          {restaurant.is_verified && (
            <Badge variant="secondary" className="rounded-full">
              <BadgeCheck className="mr-1 h-3 w-3" /> Verified
            </Badge>
          )}
        </div>
      </div>
      <div className="space-y-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-semibold text-foreground">{restaurant.name}</h3>
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            {Number(restaurant.avg_rating ?? 0).toFixed(1)}
          </span>
        </div>
        <p className="line-clamp-1 text-xs text-muted-foreground">
          {[restaurant.cuisine, restaurant.price_range].filter(Boolean).join(" · ") || "Restaurant"}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
          {distanceKm != null && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {formatDistance(distanceKm)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {restaurant.delivery_estimate_minutes} min
          </span>
          <span className="flex items-center gap-1">
            <Bike className="h-3 w-3" />
            {Number(restaurant.delivery_fee) === 0
              ? "Free delivery"
              : money(restaurant.delivery_fee, restaurant.currency)}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function StatusTracker({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
        This order was cancelled.
      </div>
    );
  }
  const currentIndex = TRACKING_STEPS.indexOf(status);
  return (
    <ol className="space-y-0" aria-label="Order progress">
      {TRACKING_STEPS.map((step, i) => {
        const done = i <= currentIndex;
        const active = i === currentIndex;
        return (
          <li key={step} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                aria-hidden
                className={`mt-1 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                  done ? "border-primary bg-primary" : "border-border bg-background"
                } ${active ? "ring-4 ring-primary/20" : ""}`}
              >
                {done && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
              </span>
              {i < TRACKING_STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={`w-0.5 flex-1 ${i < currentIndex ? "bg-primary" : "bg-border"}`}
                  style={{ minHeight: 28 }}
                />
              )}
            </div>
            <div className="pb-6">
              <p
                className={`text-sm ${active ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground"}`}
              >
                {ORDER_STATUS_LABEL[step]}
              </p>
              {active && (
                <p className="text-xs text-muted-foreground">
                  {step === "new"
                    ? "Waiting for the restaurant to accept"
                    : step === "accepted"
                      ? "Your order is confirmed"
                      : step === "preparing"
                        ? "The kitchen is on it"
                        : step === "ready"
                          ? "Ready for pickup / handover"
                          : step === "out_for_delivery"
                            ? "On the way to you"
                            : "Enjoy your meal!"}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
