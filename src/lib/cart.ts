import { useEffect, useState, useCallback } from "react";

const KEY = "mealmate.cart.v1";

export type CartLine = {
  menu_item_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  image_url?: string | null;
};

export type Cart = {
  restaurant_id: string;
  restaurant_slug: string;
  restaurant_name: string;
  currency: string;
  delivery_fee: number;
  min_order_amount: number;
  lines: CartLine[];
};

const EVENT = "mealmate:cart";

export function readCart(): Cart | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cart;
    if (!parsed?.restaurant_id || !Array.isArray(parsed.lines)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(cart: Cart | null) {
  if (typeof window === "undefined") return;
  if (!cart || cart.lines.length === 0) window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event(EVENT));
}

export function clearCart() {
  write(null);
}

export function cartTotals(cart: Cart | null) {
  const subtotal = (cart?.lines ?? []).reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const deliveryFee = cart?.delivery_fee ?? 0;
  const count = (cart?.lines ?? []).reduce((s, l) => s + l.quantity, 0);
  return { subtotal, deliveryFee, total: subtotal + deliveryFee, count };
}

export function useCart() {
  const [cart, setCart] = useState<Cart | null>(null);

  useEffect(() => {
    const sync = () => setCart(readCart());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const addItem = useCallback(
    (
      restaurant: Pick<Cart, "restaurant_id" | "restaurant_slug" | "restaurant_name" | "currency" | "delivery_fee" | "min_order_amount">,
      line: Omit<CartLine, "quantity">,
      quantity = 1,
    ): { replaced: boolean } => {
      const current = readCart();
      const sameRestaurant = current?.restaurant_id === restaurant.restaurant_id;
      const base: Cart = sameRestaurant && current ? current : { ...restaurant, lines: [] };
      const lines = [...base.lines];
      const idx = lines.findIndex((l) => l.menu_item_id === line.menu_item_id);
      if (idx >= 0) lines[idx] = { ...lines[idx]!, quantity: lines[idx]!.quantity + quantity };
      else lines.push({ ...line, quantity });
      write({ ...restaurant, lines });
      return { replaced: !!current && !sameRestaurant };
    },
    [],
  );

  const setQuantity = useCallback((menuItemId: string, quantity: number) => {
    const current = readCart();
    if (!current) return;
    const lines = current.lines
      .map((l) => (l.menu_item_id === menuItemId ? { ...l, quantity } : l))
      .filter((l) => l.quantity > 0);
    write(lines.length ? { ...current, lines } : null);
  }, []);

  const removeItem = useCallback((menuItemId: string) => setQuantity(menuItemId, 0), [setQuantity]);

  return { cart, addItem, setQuantity, removeItem, clear: clearCart, ...cartTotals(cart) };
}
