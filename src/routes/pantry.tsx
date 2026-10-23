import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Refrigerator, Camera, ChefHat, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { myPantryQuery } from "@/lib/queries";
import { firebaseData } from "@/lib/firebase-data";
import { useSession } from "@/hooks/use-session";
import { generateRecipe } from "@/lib/ai.functions";
import { pantryRecipeQuery } from "@/lib/pantry-recipe";

export const Route = createFileRoute("/pantry")({
  head: () => ({
    meta: [
      { title: "Your Pantry — MealMate" },
      {
        name: "description",
        content: "Manage your ingredients and find a recipe using what you already have.",
      },
      { property: "og:title", content: "Your Pantry — MealMate" },
      {
        property: "og:description",
        content: "Keep ingredients organised and cook from your pantry with MealMate.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PantryPage,
});

function PantryPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { data: items = [], isLoading, error } = useQuery({ ...myPantryQuery(), enabled: !!user });
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  async function add() {
    if (!user || !name.trim() || busy) return;
    setBusy(true);
    try {
      const { error } = await firebaseData.from("pantry_items").insert({
        user_id: user.id,
        name: name.trim(),
        quantity: quantity.trim() || null,
        source: "manual",
      });
      if (error) throw error;
      setName("");
      setQuantity("");
      await client.invalidateQueries({ queryKey: ["pantry"] });
    } catch {
      toast.error("Couldn't add that ingredient. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (!user) return;
    setRemoving(id);
    try {
      const { error } = await firebaseData
        .from("pantry_items")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
      await client.invalidateQueries({ queryKey: ["pantry"] });
    } catch {
      toast.error("Couldn't remove that ingredient.");
    } finally {
      setRemoving(null);
    }
  }
  async function cook() {
    const query = pantryRecipeQuery(items.map((item) => item.name));
    if (!query || generating) return;
    setGenerating(true);
    try {
      const { slug } = await generateRecipe({ data: { query } });
      await navigate({ to: "/recipe/$slug", params: { slug } });
    } catch {
      toast.error("The chef couldn't find a recipe right now. Please try again.");
    } finally {
      setGenerating(false);
    }
  }
  return (
    <main className="w-full flex-1 px-5 py-8 sm:px-8">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl">Your pantry</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {items.length} ingredients, endless possibilities.
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          size="icon"
          className="size-11 rounded-full"
          title="Scan ingredients"
        >
          <Link to="/scan" search={{ mode: "ingredients" }} aria-label="Scan ingredients">
            <Camera />
          </Link>
        </Button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="mt-8 grid grid-cols-[minmax(0,1fr)_80px_auto] gap-2"
      >
        <Input
          aria-label="Ingredient"
          placeholder="Add an ingredient"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          className="h-11"
          required
        />
        <Input
          aria-label="Quantity"
          placeholder="Qty"
          value={quantity}
          maxLength={60}
          onChange={(e) => setQuantity(e.target.value)}
          className="h-11"
        />
        <Button
          type="submit"
          size="icon"
          className="size-11 rounded-full"
          aria-label="Add ingredient"
          disabled={busy || !name.trim()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Plus />}
        </Button>
      </form>
      <div className="mt-8">
        {isLoading ? (
          <p className="py-12 text-center text-muted-foreground">Loading ingredients…</p>
        ) : error ? (
          <div className="py-10 text-center">
            <p>Couldn't load your pantry.</p>
            <Button
              variant="ghost"
              onClick={() => client.invalidateQueries({ queryKey: ["pantry"] })}
            >
              Try again
            </Button>
          </div>
        ) : !items.length ? (
          <div className="py-16 text-center">
            <Refrigerator className="mx-auto size-10 text-muted-foreground" />
            <h2 className="mt-4 text-xl">A fresh start</h2>
            <p className="mt-2 text-sm text-muted-foreground">Your pantry is empty.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li
                key={item.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4"
              >
                <div className="min-w-0">
                  <p className="break-words font-medium">{item.name}</p>
                  {item.quantity && (
                    <p className="text-sm text-muted-foreground">{item.quantity}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 rounded-full"
                  aria-label={`Remove ${item.name}`}
                  disabled={removing === item.id}
                  onClick={() => remove(item.id)}
                >
                  {removing === item.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button
        className="mt-8 h-12 w-full rounded-full"
        disabled={!items.length || generating}
        onClick={cook}
      >
        {generating ? <Loader2 className="animate-spin" /> : <ChefHat />} Find a recipe
      </Button>
      <Button asChild variant="ghost" className="mt-3 h-11 w-full">
        <Link to="/list">Shopping list</Link>
      </Button>
    </main>
  );
}
