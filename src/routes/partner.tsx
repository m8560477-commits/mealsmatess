import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Store } from "lucide-react";
import { toast } from "sonner";
import { submitRestaurantApplication } from "@/lib/restaurants.functions";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/partner")({
  head: () => ({
    meta: [
      { title: "Partner with MealMate | List your restaurant" },
      {
        name: "description",
        content:
          "Apply to list your restaurant on MealMate. Reach hungry local customers, manage your menu and take delivery orders.",
      },
      { property: "og:title", content: "Partner with MealMate" },
      {
        property: "og:description",
        content: "List your restaurant on MealMate and start taking delivery orders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PartnerPage,
});

function PartnerPage() {
  const { user } = useSession();
  const submit = useServerFn(submitRestaurantApplication);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    name: "",
    owner_name: "",
    description: "",
    cuisine: "",
    phone: "",
    email: "",
    address: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await submit({
        data: {
          name: form.name.trim(),
          owner_name: form.owner_name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
          currency: "ZAR",
          delivery_fee: 0,
          min_order_amount: 0,
          delivery_radius_km: 10,
          delivery_estimate_minutes: 35,
          ...(form.description.trim() ? { description: form.description.trim() } : {}),
          ...(form.cuisine.trim() ? { cuisine: form.cuisine.trim() } : {}),
        },
      });
      setDone(true);
      toast.success("Application submitted — we'll review it shortly");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit your application");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <Store className="h-10 w-10 text-primary" />
        <h1 className="font-display text-2xl">Application received</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Our team reviews new restaurants within 1–2 business days. We'll email you as soon as you're
          approved.
        </p>
        <Button asChild className="rounded-full">
          <Link to="/restaurants">Back to restaurants</Link>
        </Button>
      </main>
    );
  }

  return (
    <div className="page-enter mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="font-display text-2xl">Partner with MealMate</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell us about your restaurant. Once approved you'll get a dashboard to manage your menu and orders.
      </p>

      {user && (
        <div className="md3-surface mt-4 flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4">
          <p className="text-sm">Already a partner?</p>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link to="/partner/dashboard">Open dashboard</Link>
          </Button>
        </div>
      )}

      {!user ? (
        <div className="md3-surface mt-6 rounded-3xl border border-dashed border-border p-8 text-center">
          <p className="text-sm">Sign in to apply as a restaurant partner.</p>
          <Button asChild size="sm" className="mt-4 rounded-full">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="md3-surface mt-6 space-y-4 rounded-3xl border border-border/60 bg-card p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Restaurant name</Label>
              <Input id="name" required value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="owner_name">Owner name</Label>
              <Input
                id="owner_name"
                required
                value={form.owner_name}
                onChange={(e) => set("owner_name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" required value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                required
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cuisine">Cuisine</Label>
              <Input
                id="cuisine"
                placeholder="e.g. Halaal grills, Italian"
                value={form.cuisine}
                onChange={(e) => set("cuisine", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="description">About your restaurant</Label>
              <Textarea
                id="description"
                rows={4}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" disabled={busy} className="w-full rounded-full">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit application
          </Button>
        </form>
      )}
    </div>
  );
}
