import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listRestaurantOrders } from "@/lib/restaurants.functions";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

function watchCollection(
  table: string,
  constraints: QueryConstraint[],
  onChange: (snapshot: unknown) => void,
) {
  const activeQuery = query(collection(db, table), ...constraints);
  return onSnapshot(activeQuery, onChange, (error) =>
    console.error(`[firebase realtime] ${table}`, error),
  );
}

export function useRestaurantRealtime(restaurantId: string | undefined, slug?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!restaurantId) return;
    const invalidateMenu = () => {
      void queryClient.invalidateQueries({ queryKey: ["restaurant-menu", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["marketplace-feed"] });
    };
    const unsubscribers = [
      onSnapshot(
        doc(db, "restaurants", restaurantId),
        () => {
          if (slug) void queryClient.invalidateQueries({ queryKey: ["restaurant", slug] });
          void queryClient.invalidateQueries({ queryKey: ["restaurants", "approved"] });
          void queryClient.invalidateQueries({ queryKey: ["marketplace-feed"] });
        },
        (error) => console.error("[firebase realtime] restaurant", error),
      ),
      watchCollection(
        "menu_items",
        [where("restaurant_id", "==", restaurantId), where("is_hidden", "==", false)],
        invalidateMenu,
      ),
      watchCollection(
        "restaurant_promotions",
        [where("restaurant_id", "==", restaurantId), where("is_active", "==", true)],
        () => {
          void queryClient.invalidateQueries({ queryKey: ["restaurant-promotions", restaurantId] });
          void queryClient.invalidateQueries({ queryKey: ["marketplace-feed"] });
        },
      ),
      watchCollection("restaurant_locations", [where("restaurant_id", "==", restaurantId)], () => {
        void queryClient.invalidateQueries({ queryKey: ["restaurant-branches", restaurantId] });
      }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [restaurantId, slug, queryClient]);
}

export function useMarketplaceRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribers = [
      watchCollection(
        "restaurants",
        [where("approval_status", "==", "approved"), where("is_demo", "==", false)],
        () => {
          void queryClient.invalidateQueries({ queryKey: ["marketplace-feed"] });
          void queryClient.invalidateQueries({ queryKey: ["restaurants", "approved"] });
        },
      ),
      watchCollection(
        "menu_items",
        [where("is_available", "==", true), where("is_hidden", "==", false)],
        () => {
          void queryClient.invalidateQueries({ queryKey: ["marketplace-feed"] });
        },
      ),
      watchCollection("restaurant_promotions", [where("is_active", "==", true)], () => {
        void queryClient.invalidateQueries({ queryKey: ["marketplace-feed"] });
      }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [queryClient]);
}

export function useOrderRealtime(orderId: string | undefined, onChange?: (status: string) => void) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orderId) return;
    return onSnapshot(
      doc(db, "restaurant_orders", orderId),
      (snapshot) => {
        if (!snapshot.exists()) return;
        void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
        void queryClient.invalidateQueries({ queryKey: ["restaurant-order", orderId] });
        void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
        const status = snapshot.data().status;
        if (typeof status === "string") onChange?.(status);
      },
      (error) => console.error("[firebase realtime] order", error),
    );
    // The callback is intentionally excluded because callers pass inline handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, queryClient]);
}

export function usePartnerOrdersRealtime(
  restaurantId: string | undefined,
  onNewOrder?: () => void,
) {
  const queryClient = useQueryClient();
  const loadOrders = useServerFn(listRestaurantOrders);
  const previousOrderIds = useRef<Set<string> | null>(null);

  const { data: orders } = useQuery({
    queryKey: ["partner-orders-live", restaurantId],
    enabled: Boolean(restaurantId && auth.currentUser),
    queryFn: () => loadOrders({ data: { restaurantId: restaurantId!, scope: "active" } }),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (!orders || !restaurantId) return;
    const nextIds = new Set<string>((orders as { id: string }[]).map((order) => order.id));
    const previous = previousOrderIds.current;
    if (previous) {
      const receivedNewOrder = [...nextIds].some((orderId) => !previous.has(orderId));
      if (receivedNewOrder) onNewOrder?.();
      void queryClient.invalidateQueries({ queryKey: ["partner", "orders", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["partner", "stats", restaurantId] });
    }
    previousOrderIds.current = nextIds;
    // The callback is intentionally excluded because callers pass inline handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, restaurantId, queryClient]);
}

export function useMyOrdersRealtime(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || auth.currentUser?.uid !== userId) return;
    return watchCollection("restaurant_orders", [where("customer_id", "==", userId)], () => {
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["my-restaurant-orders"] });
    });
  }, [userId, queryClient]);
}
