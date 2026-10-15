import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bike,
  ChevronDown,
  ChevronRight,
  Clock3,
  Heart,
  LocateFixed,
  MapPin,
  Mic,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Star,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { money } from "@/components/restaurant/bits";
import { useMarketplaceRealtime } from "@/lib/marketplace.realtime";
import { useCart } from "@/lib/cart";
import { formatDistance, haversineKm, isOpenNow, useUserLocation } from "@/lib/geo";
import {
  DISCOVERY_CATEGORIES,
  marketplaceFeedQuery,
  matchesCategory,
  promoHeadline,
  useFavouriteRestaurants,
  type CategoryKey,
  type FeedDish,
  type FeedPromotion,
  type FeedRestaurant,
} from "@/lib/marketplace.queries";
import { RECIPE_PHOTOS } from "@/assets/recipes/manifest";
import { cn } from "@/lib/utils";
import { AdSlot } from "@/components/ad-slot";
import { usePreferences } from "@/hooks/use-preferences";
import { personalize } from "@/lib/preferences";

export const Route = createFileRoute("/restaurants")({
  head: () => ({
    meta: [
      { title: "Restaurants & Food Delivery | MealMate" },
      {
        name: "description",
        content: "Discover restaurants, dishes and local food deals near you with MealMate.",
      },
      { property: "og:title", content: "Restaurants & Food Delivery | MealMate" },
      {
        property: "og:description",
        content: "Discover local restaurants, food deals and fast delivery with MealMate.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DiningComingSoon,
});

function DiningComingSoon() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Store className="h-8 w-8 text-primary" />
      </div>
      <span className="mb-3 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
        Not yet available
      </span>
      <h1 className="font-sans text-2xl font-bold text-foreground">Dining is coming soon</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        We're still getting restaurants and food delivery ready. Check back soon — in the meantime,
        explore recipes and plan your meals.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Back to Home</Link>
      </Button>
    </main>
  );
}

export { RestaurantsPage };

type FilterKey = "all" | "rated" | "fast" | "halal" | "vegetarian" | "deals" | "under100";
type RestaurantRow = { restaurant: FeedRestaurant; distance: number | null; hasDeal: boolean };
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "rated", label: "Top Rated" },
  { key: "fast", label: "Fast" },
  { key: "halal", label: "Halal" },
  { key: "vegetarian", label: "Vegetarian" },
  { key: "deals", label: "Deals" },
  { key: "under100", label: "Under R100" },
];
const FALLBACKS = Object.values(RECIPE_PHOTOS).map((photo) => photo.card);

function restaurantText(restaurant: FeedRestaurant, dishes: FeedDish[]) {
  return `${restaurant.name} ${restaurant.cuisine ?? ""} ${restaurant.description ?? ""} ${dishes
    .filter((dish) => dish.restaurant_id === restaurant.id)
    .map((dish) => `${dish.name} ${dish.category ?? ""} ${dish.dietary_tags.join(" ")}`)
    .join(" ")}`.toLowerCase();
}

function sectionTitle(title: string, subtitle?: string) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 px-4">
      <div className="min-w-0">
        <h2 className="font-sans text-xl font-bold text-foreground">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </div>
  );
}

function RestaurantsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch, isFetching } = useQuery(marketplaceFeedQuery());
  useMarketplaceRealtime();
  const {
    coords,
    state: geoState,
    request: requestLocation,
    clear: clearLocation,
  } = useUserLocation();
  const { cart, addItem, setQuantity, count, subtotal } = useCart();
  const { preferences, hasPreferences } = usePreferences();
  const { isFavourite, toggle } = useFavouriteRestaurants();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryKey | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [slide, setSlide] = useState(0);
  const [locationLabel, setLocationLabel] = useState("Choose delivery location");
  const [manualLocation, setManualLocation] = useState("");
  const carouselRef = useRef<HTMLDivElement>(null);

  const restaurants = data?.restaurants ?? [];
  const dishes = data?.dishes ?? [];
  const promotions = data?.promotions ?? [];
  const restaurantById = useMemo(
    () => new Map(restaurants.map((restaurant) => [restaurant.id, restaurant])),
    [restaurants],
  );
  const promoRestaurantIds = useMemo(
    () => new Set(promotions.map((promotion) => promotion.restaurant_id)),
    [promotions],
  );

  useEffect(() => {
    if (geoState === "granted") setLocationLabel("Current location");
  }, [geoState]);

  const rows = useMemo<RestaurantRow[]>(
    () =>
      restaurants
        .map((restaurant) => {
          const place = restaurant.restaurant_locations?.[0];
          return {
            restaurant,
            distance: coords && place ? haversineKm(coords, place) : null,
            hasDeal: promoRestaurantIds.has(restaurant.id),
          };
        })
        .filter(({ restaurant, distance, hasDeal }) => {
          const text = restaurantText(restaurant, dishes);
          const searchMatch = !search.trim() || text.includes(search.trim().toLowerCase());
          const categoryMatch = !category || matchesCategory(category, text, hasDeal);
          if (!searchMatch || !categoryMatch) return false;
          if (
            coords &&
            distance != null &&
            distance > Number(restaurant.delivery_radius_km ?? 10) + 5
          )
            return false;
          if (filter === "rated") return Number(restaurant.avg_rating) >= 4;
          if (filter === "fast") return restaurant.delivery_estimate_minutes <= 35;
          if (filter === "halal") return text.includes("halal");
          if (filter === "vegetarian") return text.includes("vegetarian") || text.includes("vegan");
          if (filter === "deals") return hasDeal;
          if (filter === "under100")
            return dishes.some(
              (dish) => dish.restaurant_id === restaurant.id && Number(dish.price) < 100,
            );
          return true;
        })
        .sort((a, b) =>
          filter === "rated"
            ? Number(b.restaurant.avg_rating) - Number(a.restaurant.avg_rating)
            : filter === "fast"
              ? a.restaurant.delivery_estimate_minutes - b.restaurant.delivery_estimate_minutes
              : a.distance != null && b.distance != null
                ? a.distance - b.distance
                : Number(b.restaurant.avg_rating) - Number(a.restaurant.avg_rating),
        ),
    [restaurants, coords, dishes, promoRestaurantIds, search, category, filter],
  );

  const visibleDishes = useMemo(
    () => dishes.filter((dish) => rows.some((row) => row.restaurant.id === dish.restaurant_id)),
    [dishes, rows],
  );
  const banners = useMemo(() => {
    if (promotions.length) return promotions.slice(0, 4);
    return restaurants.slice(0, 3).map((restaurant, index) => ({
      id: `feature-${restaurant.id}`,
      restaurant_id: restaurant.id,
      code: null,
      title:
        ["Grab your lunch fix", "New season. New flavours.", "Local favourites, delivered"][
          index
        ] ?? "Made for your appetite",
      description: restaurant.description,
      kind: "feature",
      value: 0,
      min_order_amount: 0,
      max_discount_amount: null,
      starts_at: null,
      ends_at: null,
      is_active: true,
    }));
  }, [promotions, restaurants]);

  useEffect(() => {
    if (banners.length < 2) return;
    const timer = window.setInterval(() => {
      const next = (slide + 1) % banners.length;
      setSlide(next);
      carouselRef.current?.scrollTo({
        left: carouselRef.current.clientWidth * next,
        behavior: "smooth",
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [banners.length, slide]);

  const addDish = (dish: FeedDish) => {
    const restaurant = restaurantById.get(dish.restaurant_id);
    if (!restaurant) return;
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
        menu_item_id: dish.id,
        name: dish.name,
        unit_price: Number(dish.price),
        image_url: dish.image_url,
      },
    );
    toast.success(`${dish.name} added`, {
      ...(replaced ? { description: "Your previous restaurant cart was cleared." } : {}),
    });
  };

  return (
    <div className="marketplace-dark min-h-screen bg-background pb-36 text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="mx-auto max-w-3xl">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                className="h-auto max-w-full justify-start rounded-2xl px-2 py-1.5 text-left"
              >
                <MapPin className="h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase text-muted-foreground">
                    Deliver to
                  </span>
                  <span className="block truncate text-sm font-bold">{locationLabel}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="marketplace-dark rounded-t-3xl border-border bg-card pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            >
              <SheetHeader className="text-left">
                <SheetTitle className="font-sans text-xl font-bold">Delivery location</SheetTitle>
                <SheetDescription>
                  Use your position or enter an area to personalise nearby restaurants.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-5 space-y-3">
                <Button
                  className="h-12 w-full rounded-xl"
                  onClick={requestLocation}
                  disabled={geoState === "prompting"}
                >
                  <LocateFixed />
                  {geoState === "prompting" ? "Finding you…" : "Use current location"}
                </Button>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={manualLocation}
                    onChange={(event) => setManualLocation(event.target.value)}
                    placeholder="Suburb, address or landmark"
                    className="h-12 rounded-xl bg-muted pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  className="h-11 w-full rounded-xl"
                  disabled={!manualLocation.trim()}
                  onClick={() => {
                    setLocationLabel(manualLocation.trim());
                    clearLocation();
                    toast.success("Delivery area updated");
                  }}
                >
                  Set this location
                </Button>
                {geoState === "denied" && (
                  <p className="text-xs text-destructive">
                    Location access was blocked. Enter your area instead.
                  </p>
                )}
              </div>
            </SheetContent>
          </Sheet>
          <div className="relative mt-2">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search restaurants, dishes"
              aria-label="Search restaurants and dishes"
              className="h-13 rounded-2xl border-border bg-card pl-12 pr-12 text-base shadow-none focus-visible:ring-2"
            />
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-1.5 top-1/2 h-10 w-10 -translate-y-1/2 rounded-xl"
              aria-label="Voice search"
              onClick={() => toast.info("Voice search is not available on this device")}
            >
              <Mic className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 pt-5">
        <section aria-label="Food categories">
          <div className="no-scrollbar flex snap-x gap-4 overflow-x-auto px-4 pb-1">
            {DISCOVERY_CATEGORIES.slice(0, 8).map((item, index) => {
              const image =
                dishes[index % Math.max(dishes.length, 1)]?.image_url ||
                restaurants[index % Math.max(restaurants.length, 1)]?.cover_image_url;
              return (
                <Button
                  key={item.key}
                  variant="ghost"
                  className="h-auto w-20 shrink-0 snap-start flex-col gap-2 rounded-2xl p-0"
                  onClick={() => setCategory(category === item.key ? null : item.key)}
                  aria-pressed={category === item.key}
                >
                  <span
                    className={cn(
                      "grid h-16 w-16 place-items-center overflow-hidden rounded-full border bg-card text-lg font-black text-primary transition-transform active:scale-95",
                      category === item.key
                        ? "border-primary bg-primary/15 ring-2 ring-primary/30"
                        : "border-border",
                    )}
                  >
                    {image ? (
                      <img src={image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      item.label.slice(0, 1)
                    )}
                  </span>
                  <span
                    className={cn(
                      "w-full whitespace-normal text-center text-xs",
                      category === item.key ? "font-bold text-primary" : "text-foreground",
                    )}
                  >
                    {item.label}
                  </span>
                </Button>
              );
            })}
          </div>
        </section>

        <section
          aria-label="Restaurant filters"
          className="no-scrollbar flex gap-2 overflow-x-auto px-4"
        >
          {FILTERS.map((item) => (
            <Button
              key={item.key}
              size="sm"
              variant={filter === item.key ? "default" : "outline"}
              className="h-9 shrink-0 rounded-full px-4 shadow-none"
              onClick={() => setFilter(item.key)}
            >
              <SlidersHorizontal className={cn("h-3.5 w-3.5", item.key !== "all" && "hidden")} />
              {item.label}
            </Button>
          ))}
        </section>

        {isLoading ? (
          <MarketplaceSkeleton />
        ) : isError ? (
          <div className="mx-4 rounded-2xl border border-destructive/40 bg-card p-6 text-center">
            <Store className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 font-sans text-lg font-bold">Restaurants didn't load</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your connection and try again.
            </p>
            <Button className="mt-4 rounded-full" onClick={() => refetch()} disabled={isFetching}>
              <RotateCcw />
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyResults
            clear={() => {
              setSearch("");
              setCategory(null);
              setFilter("all");
            }}
          />
        ) : (
          <>
            {banners.length > 0 && (
              <PromoCarousel
                banners={banners}
                restaurants={restaurantById}
                slide={slide}
                setSlide={setSlide}
                carouselRef={carouselRef}
              />
            )}
            <section>
              {sectionTitle("Popular brands", "Local names people love")}
              <div className="no-scrollbar flex snap-x gap-4 overflow-x-auto px-4">
                {rows.slice(0, 8).map(({ restaurant }, index) => (
                  <Link
                    key={restaurant.id}
                    to="/restaurant/$slug"
                    params={{ slug: restaurant.slug }}
                    className="w-21 shrink-0 snap-start text-center"
                  >
                    <span className="mx-auto grid h-18 w-18 place-items-center overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                      {restaurant.logo_url ? (
                        <img
                          src={restaurant.logo_url}
                          alt={`${restaurant.name} logo`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-xl font-black text-primary">
                          {restaurant.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="mt-2 block truncate text-xs font-semibold">
                      {restaurant.name}
                    </span>
                    {index === 0 && <span className="text-[10px] text-muted-foreground">Ad</span>}
                  </Link>
                ))}
              </div>
            </section>
            {visibleDishes.length > 0 && (
              <DishSection
                title="Lunchtime just got better! 🍔😋"
                dishes={visibleDishes.slice(0, 8)}
                restaurants={restaurantById}
                cart={cart}
                addDish={addDish}
                setQuantity={setQuantity}
              />
            )}
            <RestaurantSection
              title="Recommended for you"
              rows={personalize(hasPreferences ? preferences : null, rows, (row) => [
                row.restaurant.name,
                row.restaurant.cuisine,
                row.restaurant.description,
              ])}
              promotions={promotions}
              isFavourite={isFavourite}
              toggle={toggle}
            />
            <div className="px-4">
              <AdSlot slot="restaurants" />
            </div>
            <RestaurantSection
              title="Fast near you"
              rows={[...rows].sort(
                (a, b) =>
                  a.restaurant.delivery_estimate_minutes - b.restaurant.delivery_estimate_minutes,
              )}
              promotions={promotions}
              isFavourite={isFavourite}
              toggle={toggle}
            />
            {visibleDishes.some((dish) => Number(dish.price) < 100) && (
              <DishSection
                title="Under R100"
                dishes={visibleDishes.filter((dish) => Number(dish.price) < 100).slice(0, 8)}
                restaurants={restaurantById}
                cart={cart}
                addDish={addDish}
                setQuantity={setQuantity}
              />
            )}
            {promotions.length > 0 && (
              <RestaurantSection
                title="Deals you'll love"
                rows={rows.filter((row) => row.hasDeal)}
                promotions={promotions}
                isFavourite={isFavourite}
                toggle={toggle}
              />
            )}
            <RestaurantSection
              title="Popular in your area"
              rows={[...rows].sort(
                (a, b) => Number(b.restaurant.avg_rating) - Number(a.restaurant.avg_rating),
              )}
              promotions={promotions}
              isFavourite={isFavourite}
              toggle={toggle}
            />
          </>
        )}
      </main>

      {count > 0 && (
        <Button
          className="fixed inset-x-4 bottom-20 z-40 mx-auto h-13 max-w-md justify-between rounded-2xl px-5 shadow-xl"
          onClick={() => navigate({ to: "/checkout" })}
        >
          <span className="flex items-center gap-2">
            <ShoppingBag />
            {count} item{count === 1 ? "" : "s"}
          </span>
          <span>{money(subtotal, cart?.currency)} · View cart</span>
        </Button>
      )}
    </div>
  );
}

function PromoCarousel({
  banners,
  restaurants,
  slide,
  setSlide,
  carouselRef,
}: {
  banners: FeedPromotion[];
  restaurants: Map<string, FeedRestaurant>;
  slide: number;
  setSlide: (value: number) => void;
  carouselRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <section aria-label="Offers">
      <div
        ref={carouselRef}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(event) => {
          const width = event.currentTarget.clientWidth;
          if (width) setSlide(Math.round(event.currentTarget.scrollLeft / width));
        }}
      >
        {banners.map((promo, index) => {
          const restaurant = restaurants.get(promo.restaurant_id);
          return (
            <article key={promo.id} className="w-full shrink-0 snap-center px-4">
              <div className="relative h-52 overflow-hidden rounded-3xl border border-border bg-card">
                <img
                  src={restaurant?.cover_image_url || FALLBACKS[(index + 3) % FALLBACKS.length]}
                  alt="Promotional food"
                  className="h-full w-full object-cover"
                />
                <div className="marketplace-promo-overlay absolute inset-0" />
                <div className="absolute inset-y-0 left-0 flex w-3/4 flex-col justify-center p-6">
                  <span className="mb-2 text-xs font-bold uppercase text-primary">
                    {promoHeadline(promo, restaurant?.currency)}
                  </span>
                  <h2 className="font-sans text-2xl font-black text-market-hero">{promo.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-market-hero/75">
                    {promo.description || restaurant?.name || "Fresh flavour, delivered."}
                  </p>
                  {restaurant && (
                    <Button asChild size="sm" className="mt-4 w-fit rounded-full">
                      <Link to="/restaurant/$slug" params={{ slug: restaurant.slug }}>
                        Order now <ChevronRight />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="mt-3 flex justify-center gap-1.5">
        {banners.map((banner, index) => (
          <Button
            key={banner.id}
            variant="ghost"
            size="icon"
            className="h-5 w-5 rounded-full p-0"
            aria-label={`Show offer ${index + 1}`}
            onClick={() => {
              setSlide(index);
              carouselRef.current?.scrollTo({
                left: carouselRef.current.clientWidth * index,
                behavior: "smooth",
              });
            }}
          >
            <span
              className={cn(
                "h-1.5 rounded-full transition-all",
                slide === index ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/40",
              )}
            />
          </Button>
        ))}
      </div>
    </section>
  );
}

function DishSection({
  title,
  dishes,
  restaurants,
  cart,
  addDish,
  setQuantity,
}: {
  title: string;
  dishes: FeedDish[];
  restaurants: Map<string, FeedRestaurant>;
  cart: ReturnType<typeof useCart>["cart"];
  addDish: (dish: FeedDish) => void;
  setQuantity: (id: string, quantity: number) => void;
}) {
  return (
    <section>
      {sectionTitle(title)}
      <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4">
        {dishes.map((dish, index) => {
          const restaurant = restaurants.get(dish.restaurant_id);
          if (!restaurant) return null;
          const quantity =
            cart?.restaurant_id === restaurant.id
              ? (cart.lines.find((line) => line.menu_item_id === dish.id)?.quantity ?? 0)
              : 0;
          return (
            <article
              key={dish.id}
              className="w-44 shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card"
            >
              <Link to="/restaurant/$slug" params={{ slug: restaurant.slug }} className="block">
                <div className="relative h-32 overflow-hidden bg-muted">
                  <img
                    src={dish.image_url || FALLBACKS[index % FALLBACKS.length]}
                    alt={dish.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                  />
                  <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-1 text-[10px] font-bold">
                    <Clock3 className="mr-1 inline h-3 w-3" />
                    {restaurant.delivery_estimate_minutes} min
                  </span>
                </div>
                <div className="px-3 pt-3">
                  <p className="truncate text-sm font-bold">{dish.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{restaurant.name}</p>
                  <p className="mt-2 text-sm font-black">
                    {money(dish.price, restaurant.currency)}
                  </p>
                </div>
              </Link>
              <div className="flex h-12 items-center justify-end px-2 pb-2">
                {quantity > 0 ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-full"
                      onClick={() => setQuantity(dish.id, quantity - 1)}
                      aria-label={`Remove one ${dish.name}`}
                    >
                      <Minus />
                    </Button>
                    <span className="w-5 text-center text-sm font-bold">{quantity}</span>
                    <Button
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => setQuantity(dish.id, quantity + 1)}
                      aria-label={`Add one ${dish.name}`}
                    >
                      <Plus />
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 rounded-full"
                    onClick={() => addDish(dish)}
                    disabled={!restaurant.is_accepting_orders}
                  >
                    Add
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RestaurantSection({
  title,
  rows,
  promotions,
  isFavourite,
  toggle,
}: {
  title: string;
  rows: RestaurantRow[];
  promotions: FeedPromotion[];
  isFavourite: (id: string) => boolean;
  toggle: (id: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <section>
      {sectionTitle(title)}
      <div className="no-scrollbar flex snap-x gap-4 overflow-x-auto px-4 pb-1">
        {rows.slice(0, 10).map(({ restaurant, distance, hasDeal }, index) => {
          const promotion = promotions.find((item) => item.restaurant_id === restaurant.id);
          const open = isOpenNow(restaurant.opening_hours);
          return (
            <article
              key={restaurant.id}
              className="w-[82%] max-w-80 shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card"
            >
              <div className="relative h-40 overflow-hidden bg-muted">
                <Link to="/restaurant/$slug" params={{ slug: restaurant.slug }}>
                  <img
                    src={restaurant.cover_image_url || FALLBACKS[(index + 5) % FALLBACKS.length]}
                    alt={`${restaurant.name} food`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                  />
                </Link>
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute right-2 top-2 h-9 w-9 rounded-full bg-background/90"
                  onClick={() => toggle(restaurant.id)}
                  aria-label={
                    isFavourite(restaurant.id)
                      ? `Remove ${restaurant.name} from favourites`
                      : `Save ${restaurant.name}`
                  }
                >
                  <Heart
                    className={cn(
                      "h-4 w-4",
                      isFavourite(restaurant.id) && "fill-primary text-primary",
                    )}
                  />
                </Button>
                {hasDeal && (
                  <span className="absolute bottom-2 left-2 rounded-full bg-primary px-2.5 py-1 text-[10px] font-black text-primary-foreground">
                    {promotion ? promoHeadline(promotion, restaurant.currency) : "DEAL"}
                  </span>
                )}
              </div>
              <Link to="/restaurant/$slug" params={{ slug: restaurant.slug }} className="block p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-sans text-base font-bold">{restaurant.name}</h3>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {restaurant.cuisine || "Local favourites"}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-bold">
                    <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                    {Number(restaurant.avg_rating || 0).toFixed(1)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                    {restaurant.delivery_estimate_minutes} min
                  </span>
                  <span>
                    <Bike className="mr-1 inline h-3.5 w-3.5" />
                    {Number(restaurant.delivery_fee) === 0
                      ? "Free"
                      : money(restaurant.delivery_fee, restaurant.currency)}
                  </span>
                  {distance != null && (
                    <span>
                      <MapPin className="mr-1 inline h-3.5 w-3.5" />
                      {formatDistance(distance)}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
                  <span
                    className={
                      open === false || !restaurant.is_accepting_orders
                        ? "text-destructive"
                        : "text-primary"
                    }
                  >
                    {open === false
                      ? "Closed"
                      : restaurant.is_accepting_orders
                        ? "Open now"
                        : "Not accepting orders"}
                  </span>
                  <span className="text-muted-foreground">
                    {restaurant.price_range || "Delivery"}
                  </span>
                </div>
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MarketplaceSkeleton() {
  return (
    <div className="space-y-8 px-4" aria-label="Loading restaurants">
      <Skeleton className="h-52 rounded-3xl" />
      <div className="flex gap-3">
        <Skeleton className="h-24 w-20 rounded-2xl" />
        <Skeleton className="h-24 w-20 rounded-2xl" />
        <Skeleton className="h-24 w-20 rounded-2xl" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-64 w-72 shrink-0 rounded-2xl" />
        <Skeleton className="h-64 w-72 shrink-0 rounded-2xl" />
      </div>
    </div>
  );
}
function EmptyResults({ clear }: { clear: () => void }) {
  return (
    <div className="mx-4 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <Search className="mx-auto h-9 w-9 text-muted-foreground" />
      <h2 className="mt-3 font-sans text-lg font-bold">Nothing matches yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">Try another dish, cuisine or filter.</p>
      <Button className="mt-4 rounded-full" onClick={clear}>
        Clear filters
      </Button>
    </div>
  );
}
