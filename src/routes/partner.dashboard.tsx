import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Store, Trash2, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  getMyRestaurant,
  getRestaurantStats,
  listRestaurantOrders,
  saveMenuItem,
  deleteMenuItem,
  updateOrderStatus,
  updateMyRestaurant,
} from "@/lib/restaurants.functions";
import { NEXT_STATUS, ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/restaurants.schemas";
import { money } from "@/components/restaurant/bits";
import { useSession } from "@/hooks/use-session";
import { usePartnerOrdersRealtime, useRestaurantRealtime } from "@/lib/marketplace.realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/partner/dashboard")({
  head: () => ({
    meta: [
      { title: "Partner dashboard | MealMate for restaurants" },
      {
        name: "description",
        content:
          "Manage your MealMate restaurant: update your menu and prices, accept incoming orders and track delivery progress in real time.",
      },
      { property: "og:title", content: "MealMate partner dashboard" },
      {
        property: "og:description",
        content: "Menus, prices and live orders for MealMate partner restaurants.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PartnerDashboard,
});

type MenuRow = {
  id: string;
  name: string;
  description: string | null;
  price: number | string;
  category: string | null;
  is_available: boolean;
  sort_order: number;
};

type OrderRow = {
  id: string;
  status: OrderStatus;
  total: number | string;
  currency: string;
  delivery_address: string | null;
  contact_phone: string | null;
  notes: string | null;
  placed_at: string;
  rejection_reason: string | null;
  order_items: { id: string; name: string; unit_price: number | string; quantity: number; notes: string | null }[];
};

const emptyItem = { name: "", description: "", price: "", category: "", is_available: true };

function PartnerDashboard() {
  const { user, loading } = useSession();
  const qc = useQueryClient();
  const fetchMine = useServerFn(getMyRestaurant);

  const mine = useQuery({
    queryKey: ["partner", "mine", user?.id],
    enabled: !!user,
    queryFn: () => fetchMine({ data: undefined as never }),
  });

  if (loading || (user && mine.isLoading)) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <Skeleton className="h-10 w-56 rounded-full" />
        <Skeleton className="h-28 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <Empty
        title="Sign in to your partner account"
        body="Restaurant owners sign in with the same MealMate account used to apply."
        cta={{ to: "/auth", label: "Sign in" }}
      />
    );
  }

  const restaurant = mine.data?.restaurant as
    | (Record<string, unknown> & { id: string; name: string; approval_status: string; currency: string; is_accepting_orders: boolean })
    | null
    | undefined;

  if (!restaurant) {
    return (
      <Empty
        title="No restaurant yet"
        body="Apply to partner with MealMate and your dashboard unlocks as soon as we approve you."
        cta={{ to: "/partner", label: "Apply now" }}
      />
    );
  }

  if (restaurant.approval_status !== "approved") {
    return (
      <Empty
        title={`Application ${restaurant.approval_status.replace("_", " ")}`}
        body="Your dashboard opens as soon as our team approves your restaurant. We usually review within 1–2 business days."
        cta={{ to: "/restaurants", label: "Browse restaurants" }}
      />
    );
  }

  return (
    <div className="page-enter mx-auto w-full max-w-3xl px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Partner dashboard
          </p>
          <h1 className="font-display text-2xl">{restaurant.name}</h1>
        </div>
        <AcceptingToggle
          restaurantId={restaurant.id}
          value={restaurant.is_accepting_orders}
          onDone={() => qc.invalidateQueries({ queryKey: ["partner", "mine"] })}
        />
      </header>

      <StatsRow restaurantId={restaurant.id} currency={restaurant.currency} />

      <Tabs defaultValue="orders" className="mt-6">
        <TabsList className="w-full rounded-full">
          <TabsTrigger value="orders" className="flex-1 rounded-full">
            Orders
          </TabsTrigger>
          <TabsTrigger value="menu" className="flex-1 rounded-full">
            Menu
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          <OrdersPanel restaurantId={restaurant.id} currency={restaurant.currency} />
        </TabsContent>
        <TabsContent value="menu" className="mt-4">
          <MenuPanel
            restaurantId={restaurant.id}
            currency={restaurant.currency}
            items={(mine.data?.menu ?? []) as unknown as MenuRow[]}
          />
        </TabsContent>
      </Tabs>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Your live customer page:{" "}
        <Link to="/restaurant/$slug" params={{ slug: String(restaurant["slug"] ?? "") }} className="underline">
          view as a customer
        </Link>
      </p>
    </div>
  );
}

function Empty({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta: { to: string; label: string };
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <Store className="h-10 w-10 text-primary" />
      <h1 className="font-display text-2xl">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      <Button asChild className="rounded-full">
        <Link to={cta.to}>{cta.label}</Link>
      </Button>
    </main>
  );
}

function AcceptingToggle({
  restaurantId,
  value,
  onDone,
}: {
  restaurantId: string;
  value: boolean;
  onDone: () => void;
}) {
  const update = useServerFn(updateMyRestaurant);
  const [busy, setBusy] = useState(false);
  return (
    <label className="md3-surface flex items-center gap-3 rounded-full border border-border/60 bg-card px-4 py-2 text-sm">
      <span className="font-medium">{value ? "Accepting orders" : "Paused"}</span>
      <Switch
        checked={value}
        disabled={busy}
        onCheckedChange={async (checked) => {
          setBusy(true);
          try {
            await update({ data: { restaurantId, is_accepting_orders: checked } });
            toast.success(checked ? "You're open for orders" : "Orders paused");
            onDone();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not update");
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}

function StatsRow({ restaurantId, currency }: { restaurantId: string; currency: string }) {
  const fetchStats = useServerFn(getRestaurantStats);
  const { data } = useQuery({
    queryKey: ["partner", "stats", restaurantId],
    queryFn: () => fetchStats({ data: { restaurantId } }),
  });
  const cards = [
    { label: "Active orders", value: data ? String(data.active) : "—" },
    { label: "Orders (30d)", value: data ? String(data.orders30d) : "—" },
    { label: "Revenue (30d)", value: data ? money(data.revenue30d, currency) : "—" },
    { label: "Avg order", value: data ? money(data.avgOrder, currency) : "—" },
  ];
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="md3-surface rounded-2xl border border-border/60 bg-card p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
          <p className="mt-1 text-lg font-semibold">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function OrdersPanel({ restaurantId, currency }: { restaurantId: string; currency: string }) {
  const qc = useQueryClient();
  const listOrders = useServerFn(listRestaurantOrders);
  const setStatus = useServerFn(updateOrderStatus);
  const [scope, setScope] = useState<"active" | "completed">("active");

  usePartnerOrdersRealtime(restaurantId);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["partner", "orders", restaurantId, scope],
    queryFn: () => listOrders({ data: { restaurantId, scope } }),
    refetchInterval: scope === "active" ? 20000 : false,
  });

  const move = useMutation({
    mutationFn: (v: { orderId: string; status: OrderStatus }) => setStatus({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(`Order marked ${ORDER_STATUS_LABEL[v.status].toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ["partner", "orders", restaurantId] });
      qc.invalidateQueries({ queryKey: ["partner", "stats", restaurantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update order"),
  });

  const orders = (data ?? []) as unknown as OrderRow[];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={scope === "active" ? "default" : "outline"}
          className="rounded-full"
          onClick={() => setScope("active")}
        >
          Active
        </Button>
        <Button
          size="sm"
          variant={scope === "completed" ? "default" : "outline"}
          className="rounded-full"
          onClick={() => setScope("completed")}
        >
          History
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto rounded-full"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {isLoading ? (
        [0, 1].map((i) => <Skeleton key={i} className="h-32 rounded-3xl" />)
      ) : orders.length === 0 ? (
        <div className="md3-surface rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {scope === "active" ? "No live orders right now." : "No past orders yet."}
        </div>
      ) : (
        orders.map((o) => (
          <article key={o.id} className="md3-surface rounded-3xl border border-border/60 bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">#{o.id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(o.placed_at).toLocaleString()}
                </p>
              </div>
              <Badge variant={o.status === "cancelled" ? "destructive" : "secondary"} className="rounded-full">
                {ORDER_STATUS_LABEL[o.status]}
              </Badge>
            </div>

            <ul className="mt-3 space-y-1 text-sm">
              {o.order_items.map((it) => (
                <li key={it.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {it.quantity}× {it.name}
                    {it.notes ? <span className="text-muted-foreground"> — {it.notes}</span> : null}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {money(Number(it.unit_price) * it.quantity, currency)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex justify-between border-t border-border/60 pt-3 text-sm font-semibold">
              <span>Total</span>
              <span>{money(o.total, currency)}</span>
            </div>

            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {o.delivery_address && <p>📍 {o.delivery_address}</p>}
              {o.contact_phone && <p>📞 {o.contact_phone}</p>}
              {o.notes && <p>📝 {o.notes}</p>}
            </div>

            {NEXT_STATUS[o.status].length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {NEXT_STATUS[o.status].map((next) => (
                  <Button
                    key={next}
                    size="sm"
                    variant={next === "cancelled" ? "outline" : "default"}
                    className="rounded-full"
                    disabled={move.isPending}
                    onClick={() => move.mutate({ orderId: o.id, status: next })}
                  >
                    {next === "cancelled" ? "Cancel" : `Mark ${ORDER_STATUS_LABEL[next].toLowerCase()}`}
                  </Button>
                ))}
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );
}

function MenuPanel({
  restaurantId,
  currency,
  items,
}: {
  restaurantId: string;
  currency: string;
  items: MenuRow[];
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveMenuItem);
  const remove = useServerFn(deleteMenuItem);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MenuRow | null>(null);
  const [form, setForm] = useState(emptyItem);
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuRow[]>();
    for (const it of items) {
      const key = it.category?.trim() || "Menu";
      map.set(key, [...(map.get(key) ?? []), it]);
    }
    return [...map.entries()];
  }, [items]);

  function openNew() {
    setEditing(null);
    setForm(emptyItem);
    setOpen(true);
  }

  function openEdit(item: MenuRow) {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description ?? "",
      price: String(item.price ?? ""),
      category: item.category ?? "",
      is_available: item.is_available,
    });
    setOpen(true);
  }

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["partner", "mine"] });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Enter a valid price");
      return;
    }
    setBusy(true);
    try {
      await save({
        data: {
          ...(editing ? { id: editing.id } : {}),
          restaurantId,
          name: form.name.trim(),
          price,
          is_available: form.is_available,
          sort_order: editing?.sort_order ?? items.length,
          ...(form.description.trim() ? { description: form.description.trim() } : {}),
          ...(form.category.trim() ? { category: form.category.trim() } : {}),
        },
      });
      toast.success(editing ? "Dish updated" : "Dish added");
      setOpen(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the dish");
    } finally {
      setBusy(false);
    }
  }

  async function destroy(item: MenuRow) {
    if (!window.confirm(`Remove "${item.name}" from your menu?`)) return;
    try {
      await remove({ data: { id: item.id } });
      toast.success("Dish removed");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the dish");
    }
  }

  async function toggleAvailable(item: MenuRow, checked: boolean) {
    try {
      await save({
        data: {
          id: item.id,
          restaurantId,
          name: item.name,
          price: Number(item.price),
          is_available: checked,
          sort_order: item.sort_order,
          ...(item.description ? { description: item.description } : {}),
          ...(item.category ? { category: item.category } : {}),
        },
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update availability");
    }
  }

  return (
    <div className="space-y-4">
      <Button onClick={openNew} className="w-full rounded-full">
        <Plus className="mr-2 h-4 w-4" /> Add dish
      </Button>

      {items.length === 0 ? (
        <div className="md3-surface rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Your menu is empty. Add your first dish so customers can order.
        </div>
      ) : (
        grouped.map(([category, rows]) => (
          <section key={category}>
            <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {category}
            </h2>
            <ul className="md3-surface overflow-hidden rounded-3xl border border-border/60 bg-card">
              {rows.map((item, i) => (
                <li
                  key={item.id}
                  className={`flex items-center gap-3 p-4 ${i > 0 ? "border-t border-border/60" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    {item.description && (
                      <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                    )}
                    <p className="mt-0.5 text-sm font-semibold">{money(item.price, currency)}</p>
                  </div>
                  <Switch
                    checked={item.is_available}
                    aria-label={`${item.name} available`}
                    onCheckedChange={(c) => toggleAvailable(item, c)}
                  />
                  <Button size="icon" variant="ghost" onClick={() => openEdit(item)} aria-label="Edit dish">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => destroy(item)}
                    aria-label="Delete dish"
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit dish" : "Add dish"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="dish-name">Name</Label>
              <Input
                id="dish-name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dish-price">Price ({currency})</Label>
                <Input
                  id="dish-price"
                  required
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dish-category">Category</Label>
                <Input
                  id="dish-category"
                  placeholder="e.g. Mains"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dish-desc">Description</Label>
              <Textarea
                id="dish-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <label className="flex items-center justify-between rounded-2xl border border-border/60 px-4 py-3 text-sm">
              Available to order
              <Switch
                checked={form.is_available}
                onCheckedChange={(c) => setForm((f) => ({ ...f, is_available: c }))}
              />
            </label>
            <DialogFooter>
              <Button type="submit" disabled={busy} className="w-full rounded-full">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? "Save changes" : "Add dish"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
