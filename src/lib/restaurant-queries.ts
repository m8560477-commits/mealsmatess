import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const RESTAURANT_PUBLIC_COLUMNS =
  "id,slug,name,description,cuisine,logo_url,cover_image_url,food_photos,opening_hours,price_range,delivery_fee,delivery_radius_km,min_order_amount,delivery_estimate_minutes,currency,avg_rating,rating_count,is_verified,is_demo,is_accepting_orders,supports_pickup,supports_delivery,address,phone,whatsapp,restaurant_locations(latitude,longitude,label,is_active)";

export type PublicRestaurant = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  food_photos: unknown;
  opening_hours: unknown;
  price_range: string | null;
  delivery_fee: number;
  delivery_radius_km: number;
  min_order_amount: number;
  delivery_estimate_minutes: number;
  currency: string;
  avg_rating: number;
  rating_count: number;
  is_verified: boolean;
  is_demo: boolean;
  is_accepting_orders: boolean;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  restaurant_locations?: { latitude: number; longitude: number; label: string | null }[];
};

function mapRestaurant(row: any): PublicRestaurant {
  return {
    ...row,
    delivery_fee: Number(row.delivery_fee ?? 0),
    delivery_radius_km: Number(row.delivery_radius_km ?? 0),
    min_order_amount: Number(row.min_order_amount ?? 0),
    delivery_estimate_minutes: Number(row.delivery_estimate_minutes ?? 30),
    avg_rating: Number(row.avg_rating ?? 0),
    rating_count: Number(row.rating_count ?? 0),
    restaurant_locations: ((row.restaurant_locations ?? []) as any[])
      .filter((l) => l.is_active !== false)
      .map((l) => ({ latitude: Number(l.latitude), longitude: Number(l.longitude), label: l.label ?? null })),
  } as PublicRestaurant;
}

/** Approved restaurants only — enforced by row-level security, not by this filter alone. */
export const approvedRestaurantsQuery = () =>
  queryOptions({
    queryKey: ["restaurants", "approved"],
    queryFn: async (): Promise<PublicRestaurant[]> => {
      const { data, error } = await supabase
        .from("restaurants")
        .select(RESTAURANT_PUBLIC_COLUMNS)
        .eq("approval_status", "approved")
        .eq("is_demo", false)
        .order("name");
      if (error) throw error;
      return ((data ?? []) as any[]).map(mapRestaurant);
    },
  });

export const restaurantBySlugQuery = (slug: string) =>
  queryOptions({
    queryKey: ["restaurant", slug],
    queryFn: async (): Promise<PublicRestaurant | null> => {
      const { data, error } = await supabase
        .from("restaurants")
        .select(RESTAURANT_PUBLIC_COLUMNS)
        .eq("slug", slug)
        .eq("approval_status", "approved")
        .eq("is_demo", false)
        .maybeSingle();
      if (error) throw error;
      return data ? mapRestaurant(data) : null;
    },
  });

export type PublicMenuItem = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  category: string | null;
  is_available: boolean;
  sort_order: number;
};

export const restaurantMenuQuery = (restaurantId: string | undefined) =>
  queryOptions({
    queryKey: ["restaurant-menu", restaurantId ?? "none"],
    queryFn: async (): Promise<PublicMenuItem[]> => {
      if (!restaurantId) return [];
      const { data, error } = await supabase
        .from("menu_items")
        .select("id,restaurant_id,name,description,image_url,price,is_available,category,sort_order")
        .eq("restaurant_id", restaurantId)
        .eq("is_available", true)
        .eq("is_hidden", false)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return ((data ?? []) as any[]).map((item) => ({
        ...item,
        price: Number(item.price ?? 0),
      })) as PublicMenuItem[];
    },
  });

export const restaurantReviewsQuery = (restaurantId: string | undefined) =>
  queryOptions({
    queryKey: ["restaurant-reviews", restaurantId ?? "none"],
    queryFn: async () => {
      if (!restaurantId) return [];
      const { data, error } = await supabase
        .from("restaurant_reviews")
        .select("id,rating,comment,created_at,user_id")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

export const myOrdersQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["my-restaurant-orders", userId ?? "anon"],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("restaurant_orders")
        .select(
          "id,status,total,currency,placed_at,delivery_fee,subtotal,restaurant_id,restaurants(name,slug,logo_url)",
        )
        .eq("customer_id", userId)
        .order("placed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

export const orderDetailQuery = (orderId: string | undefined) =>
  queryOptions({
    queryKey: ["restaurant-order", orderId ?? "none"],
    queryFn: async () => {
      if (!orderId) return null;
      const { data, error } = await supabase
        .from("restaurant_orders")
        .select(
          "id,status,subtotal,delivery_fee,total,currency,delivery_address,contact_phone,notes,rejection_reason,placed_at,completed_at,restaurant_id,restaurants(name,slug,logo_url,phone,whatsapp,delivery_estimate_minutes),order_items(id,name,unit_price,quantity,notes)",
        )
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });
