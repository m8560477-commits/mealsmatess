/**
 * Realtime bridges. A change made in the MealMate Partner Platform lands in
 * the database and is pushed straight into the customer app — no refresh.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Menu, price, availability and restaurant-profile changes for one restaurant. */
export function useRestaurantRealtime(restaurantId: string | undefined, slug?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`restaurant-live-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "menu_items", filter: `restaurant_id=eq.${restaurantId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["restaurant-menu", restaurantId] });
          queryClient.invalidateQueries({ queryKey: ["marketplace-feed"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "restaurants", filter: `id=eq.${restaurantId}` },
        () => {
          if (slug) queryClient.invalidateQueries({ queryKey: ["restaurant", slug] });
          queryClient.invalidateQueries({ queryKey: ["restaurants", "approved"] });
          queryClient.invalidateQueries({ queryKey: ["marketplace-feed"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_promotions",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["restaurant-promotions", restaurantId] });
          queryClient.invalidateQueries({ queryKey: ["marketplace-feed"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_locations",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["restaurant-branches", restaurantId] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, slug, queryClient]);
}

/** Marketplace-wide menu/restaurant changes, for the discovery feed. */
export function useMarketplaceRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("marketplace-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurants" }, () => {
        queryClient.invalidateQueries({ queryKey: ["marketplace-feed"] });
        queryClient.invalidateQueries({ queryKey: ["restaurants", "approved"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["marketplace-feed"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_promotions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["marketplace-feed"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

/** Live order status for one customer order. */
export function useOrderRealtime(orderId: string | undefined, onChange?: (status: string) => void) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order-live-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "restaurant_orders", filter: `id=eq.${orderId}` },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["order", orderId] });
          queryClient.invalidateQueries({ queryKey: ["restaurant-order", orderId] });
          queryClient.invalidateQueries({ queryKey: ["my-orders"] });
          const status = (payload.new as { status?: string } | null)?.status;
          if (status && onChange) onChange(status);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // onChange is intentionally excluded: callers pass inline handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, queryClient]);
}

/** Live order queue for the partner dashboard. */
export function usePartnerOrdersRealtime(restaurantId: string | undefined, onNewOrder?: () => void) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`partner-orders-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["partner", "orders", restaurantId] });
          queryClient.invalidateQueries({ queryKey: ["partner", "stats", restaurantId] });
          if (payload.eventType === "INSERT" && onNewOrder) onNewOrder();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, queryClient]);
}

/** Live status updates across all of one customer's orders. */
export function useMyOrdersRealtime(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`my-orders-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_orders",
          filter: `customer_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["my-orders"] });
          queryClient.invalidateQueries({ queryKey: ["my-restaurant-orders"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
