import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShoppingBag, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import { useSession } from "@/hooks/use-session";
import { placeOrder } from "@/lib/restaurants.functions";
import { money } from "@/components/restaurant/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout | MealMate" },
      {
        name: "description",
        content: "Review your restaurant order, confirm delivery details and place your order on MealMate.",
      },
      { property: "og:title", content: "Checkout | MealMate" },
      { property: "og:description", content: "Confirm your delivery details and place your MealMate order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { cart, setQuantity, clear, subtotal, deliveryFee, total } = useCart();
  const { user } = useSession();
  const navigate = useNavigate();
  const submit = useServerFn(placeOrder);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const currency = cart?.currency ?? "ZAR";
  const belowMin = !!cart && subtotal < Number(cart.min_order_amount ?? 0);

  async function handlePlace() {
    if (!cart) return;
    setBusy(true);
    try {
      const res = await submit({
        data: {
          restaurantId: cart.restaurant_id,
          items: cart.lines.map((l) => ({ menu_item_id: l.menu_item_id, quantity: l.quantity })),
          delivery_address: address.trim(),
          contact_phone: phone.trim(),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });
      clear();
      toast.success("Order placed");
      navigate({ to: "/order/$id", params: { id: res.orderId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not place your order");
    } finally {
      setBusy(false);
    }
  }

  if (!cart || cart.lines.length === 0) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <ShoppingBag className="h-10 w-10 text-muted-foreground" />
        <h1 className="font-display text-2xl">Your cart is empty</h1>
        <p className="text-sm text-muted-foreground">Browse nearby restaurants and add a few dishes.</p>
        <Button asChild className="rounded-full">
          <Link to="/restaurants">Find restaurants</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="flex-1 space-y-6 px-4 pb-10 pt-2">
      <header>
        <h1 className="font-display text-3xl leading-tight">Checkout</h1>
        <p className="text-sm text-muted-foreground">From {cart.restaurant_name}</p>
      </header>

      <section className="md3-surface space-y-3 rounded-3xl border border-border/60 bg-card p-4">
        <h2 className="text-sm font-semibold">Your items</h2>
        <ul className="space-y-3">
          {cart.lines.map((line) => (
            <li key={line.menu_item_id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-medium">{line.name}</p>
                <p className="text-xs text-muted-foreground">{money(line.unit_price, currency)}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 rounded-full"
                  aria-label={`Decrease ${line.name}`}
                  onClick={() => setQuantity(line.menu_item_id, line.quantity - 1)}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="w-6 text-center text-sm">{line.quantity}</span>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 rounded-full"
                  aria-label={`Increase ${line.name}`}
                  onClick={() => setQuantity(line.menu_item_id, line.quantity + 1)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <span className="w-20 text-right text-sm font-medium">
                {money(line.unit_price * line.quantity, currency)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="md3-surface space-y-3 rounded-3xl border border-border/60 bg-card p-4">
        <h2 className="text-sm font-semibold">Delivery details</h2>
        <Input
          placeholder="Delivery address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          aria-label="Delivery address"
        />
        <Input
          placeholder="Contact phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-label="Contact phone"
        />
        <Textarea
          placeholder="Notes for the restaurant (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          aria-label="Order notes"
        />
      </section>

      <section className="md3-surface space-y-2 rounded-3xl border border-border/60 bg-card p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{money(subtotal, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Delivery</span>
          <span>{deliveryFee === 0 ? "Free" : money(deliveryFee, currency)}</span>
        </div>
        <div className="flex justify-between border-t border-border/60 pt-2 text-base font-semibold">
          <span>Total</span>
          <span>{money(total, currency)}</span>
        </div>
        {belowMin && (
          <p className="text-xs text-destructive">
            Minimum order is {money(cart.min_order_amount, currency)}.
          </p>
        )}
      </section>

      {user ? (
        <Button
          className="w-full rounded-full"
          size="lg"
          disabled={busy || belowMin || address.trim().length < 4 || phone.trim().length < 5}
          onClick={handlePlace}
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Place order · {money(total, currency)}
        </Button>
      ) : (
        <Button asChild className="w-full rounded-full" size="lg">
          <Link to="/auth">Sign in to place your order</Link>
        </Button>
      )}
    </main>
  );
}
