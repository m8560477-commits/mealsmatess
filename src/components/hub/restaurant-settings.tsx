import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { updateMyRestaurant } from "@/lib/restaurants.functions";
import { RestaurantImageUpload } from "./restaurant-image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function RestaurantSettings({
  restaurant,
}: {
  restaurant: Record<string, unknown> & { id: string };
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateMyRestaurant);
  const [form, setForm] = useState(() =>
    Object.fromEntries(
      ["name", "description", "cuisine", "phone", "email", "address"].map((key) => [
        key,
        String(restaurant[key] ?? ""),
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await update({ data: { restaurantId: restaurant.id, ...form } });
      await qc.invalidateQueries({ queryKey: ["partner", "mine"] });
      toast.success("Restaurant details saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save restaurant details.");
    } finally {
      setBusy(false);
    }
  }
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["partner", "mine"] });
  };
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Restaurant profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These details and photos appear on your approved MealMate listing.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <RestaurantImageUpload
          restaurantId={restaurant.id}
          kind="logo"
          label="Restaurant logo"
          value={restaurant.logo_url as string | undefined}
          onUploaded={refresh}
        />
        <RestaurantImageUpload
          restaurantId={restaurant.id}
          kind="cover"
          label="Cover photo"
          value={restaurant.cover_image_url as string | undefined}
          onUploaded={refresh}
        />
      </div>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {["name", "cuisine", "phone", "email", "address"].map((key) => (
            <div key={key} className={key === "address" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
              <Label htmlFor={`restaurant-${key}`} className="capitalize">
                {key}
              </Label>
              <Input
                id={`restaurant-${key}`}
                value={form[key]}
                required={key === "name" || key === "email"}
                type={key === "email" ? "email" : "text"}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="restaurant-description">Description</Label>
          <Textarea
            id="restaurant-description"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          />
        </div>
        <Button type="submit" disabled={busy} className="rounded-full">
          {busy ? "Saving…" : "Save restaurant details"}
        </Button>
      </form>
    </section>
  );
}
