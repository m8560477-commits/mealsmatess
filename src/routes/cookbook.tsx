import { RecipeImage } from "@/components/recipe-image";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookMarked,
  Calendar,
  ChefHat,
  Clock,
  Edit3,
  Heart,
  Link2,
  Loader2,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { firebaseData } from "@/lib/firebase-data";
import { useSession } from "@/hooks/use-session";
import { myFavoritesQuery } from "@/lib/queries";
import {
  importRecipeFromUrl,
  updateRecipeBasics,
  deleteImportedRecipe,
} from "@/lib/import-recipe.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/cookbook")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Cookbook \u2014 MealMate" },
      {
        property: "og:description",
        content:
          "Your saved and imported recipes. Import from TikTok, Instagram Reels, YouTube Shorts and more.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Cookbook — MealMate" },
      {
        name: "description",
        content:
          "Your saved and imported recipes. Import from TikTok, Instagram Reels, YouTube Shorts and more.",
      },
    ],
  }),
  component: CookbookPage,
});

type CookbookItem = {
  id: string;
  slug: string;
  name: string;
  image_url: string | null;
  cooking_time_minutes: number | null;
  cuisine: string | null;
  category: string | null;
  servings: number | null;
  ingredients: unknown;
  description: string | null;
  created_by: string | null;
};

function CookbookPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CookbookItem | null>(null);
  const [planning, setPlanning] = useState<CookbookItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: favorites, isLoading } = useQuery({
    ...myFavoritesQuery(),
    enabled: !!user,
  });

  const items: CookbookItem[] = useMemo(() => {
    if (!favorites) return [];
    return favorites
      .map((f) => f.recipes as unknown as CookbookItem | null)
      .filter((r): r is CookbookItem => r != null);
  }, [favorites]);

  // Also pull user's own imports even if unfavorited
  const { data: owned } = useQuery({
    queryKey: ["cookbook", "owned", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await firebaseData
        .from("recipes")
        .select(
          "id,slug,name,image_url,image_source,cooking_time_minutes,cuisine,category,servings,ingredients,description,created_by",
        )
        .eq("created_by", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CookbookItem[];
    },
  });

  const merged = useMemo(() => {
    const map = new Map<string, CookbookItem>();
    for (const it of items) map.set(it.id, it);
    for (const it of owned ?? []) map.set(it.id, it);
    let arr = Array.from(map.values());
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.cuisine ?? "").toLowerCase().includes(q) ||
          (r.category ?? "").toLowerCase().includes(q),
      );
    }
    return arr;
  }, [items, owned, query]);

  async function handleImport() {
    const url = importUrl.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      toast.error("Please paste a valid link");
      return;
    }
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    setImporting(true);
    try {
      const { slug } = await importRecipeFromUrl({ data: { url } });
      toast.success("Recipe imported to your Cookbook");
      setImportOpen(false);
      setImportUrl("");
      await queryClient.invalidateQueries({ queryKey: ["favorites"] });
      await queryClient.invalidateQueries({ queryKey: ["cookbook"] });
      navigate({ to: "/recipe/$slug", params: { slug } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      if (msg.includes("No recipe could be detected")) {
        toast.error("No recipe could be detected from this video.");
      } else {
        toast.error("Import failed", { description: msg });
      }
    } finally {
      setImporting(false);
    }
  }

  async function toggleFavorite(recipeId: string) {
    if (!user) return;
    setBusyId(recipeId);
    try {
      await firebaseData
        .from("favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("recipe_id", recipeId);
      await queryClient.invalidateQueries({ queryKey: ["favorites"] });
      toast.success("Removed from Cookbook");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: CookbookItem) {
    if (!user) return;
    const owns = item.created_by === user.id;
    if (!owns) {
      // Just unfavorite non-owned
      await toggleFavorite(item.id);
      return;
    }
    if (!confirm(`Delete "${item.name}" from your Cookbook? This can't be undone.`)) return;
    setBusyId(item.id);
    try {
      await deleteImportedRecipe({ data: { id: item.id } });
      await queryClient.invalidateQueries({ queryKey: ["favorites"] });
      await queryClient.invalidateQueries({ queryKey: ["cookbook"] });
      toast.success("Recipe deleted");
    } catch (err) {
      toast.error("Couldn't delete", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusyId(null);
    }
  }

  async function addToGrocery(item: CookbookItem) {
    if (!user) return;
    const ingredients = (Array.isArray(item.ingredients) ? item.ingredients : []) as {
      name: string;
      quantity?: string;
    }[];
    if (ingredients.length === 0) {
      toast.error("This recipe has no ingredients");
      return;
    }
    setBusyId(item.id);
    try {
      const rows = ingredients.map((ing) => ({
        user_id: user.id,
        recipe_id: item.id,
        name: ing.name,
        quantity: ing.quantity ?? null,
      }));
      const { error } = await firebaseData.from("grocery_items").insert(rows);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["grocery"] });
      toast.success("Added to your grocery list", {
        action: { label: "View", onClick: () => navigate({ to: "/list" }) },
      });
    } catch (err) {
      toast.error("Couldn't add to list", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusyId(null);
    }
  }

  if (!loading && !user) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 text-center">
        <BookMarked className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-4 font-display text-3xl">Your Cookbook</h1>
        <p className="mt-2 text-muted-foreground">
          Sign in to save recipes and import from TikTok, Instagram, YouTube and more.
        </p>
        <Button className="mt-6" onClick={() => navigate({ to: "/auth" })}>
          Sign in
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Cookbook</h1>
          <p className="text-sm text-muted-foreground">
            Your saved and imported recipes, all in one place.
          </p>
        </div>
        <Button onClick={() => setImportOpen(true)} className="shrink-0 rounded-full" size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Import
        </Button>
      </div>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your cookbook"
          className="h-11 rounded-2xl pl-10"
        />
      </div>

      {isLoading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : merged.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-border p-10 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-3 font-display text-xl">Your cookbook is empty</h2>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
            Paste a cooking video link from TikTok, Instagram Reels, YouTube Shorts, or Facebook
            Reels — MealMate will turn it into a full recipe.
          </p>
          <Button className="mt-5" onClick={() => setImportOpen(true)}>
            <Link2 className="mr-2 h-4 w-4" />
            Import your first recipe
          </Button>
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {merged.map((item) => (
            <li
              key={item.id}
              className="group overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-md"
            >
              <div className="flex gap-3 p-3">
                <Link
                  to="/recipe/$slug"
                  params={{ slug: item.slug }}
                  className="block h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-muted"
                >
                  <RecipeImage recipe={item} size="thumb" className="h-full w-full object-cover" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to="/recipe/$slug" params={{ slug: item.slug }} className="block">
                    <h3 className="line-clamp-2 font-display text-base leading-tight">
                      {item.name}
                    </h3>
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {item.cooking_time_minutes && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {item.cooking_time_minutes}m
                      </span>
                    )}
                    {item.servings && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {item.servings}
                      </span>
                    )}
                    {item.cuisine && <span>{item.cuisine}</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <IconAction
                      title="Add to planner"
                      onClick={() => setPlanning(item)}
                      icon={Calendar}
                      disabled={busyId === item.id}
                    />
                    <IconAction
                      title="Add ingredients to shopping list"
                      onClick={() => addToGrocery(item)}
                      icon={ShoppingCart}
                      disabled={busyId === item.id}
                    />
                    {item.created_by === user?.id && (
                      <IconAction
                        title="Edit"
                        onClick={() => setEditing(item)}
                        icon={Edit3}
                        disabled={busyId === item.id}
                      />
                    )}
                    <IconAction
                      title="Remove from cookbook"
                      onClick={() => toggleFavorite(item.id)}
                      icon={Heart}
                      variant="fav"
                      disabled={busyId === item.id}
                    />
                    <IconAction
                      title="Delete"
                      onClick={() => handleDelete(item)}
                      icon={Trash2}
                      variant="danger"
                      disabled={busyId === item.id}
                    />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import a recipe from a video</DialogTitle>
            <DialogDescription>
              Paste a link from TikTok, Instagram Reels, YouTube Shorts, Facebook Reels or any
              cooking video. MealMate AI will extract the recipe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="import-url">Video link</Label>
            <Input
              id="import-url"
              autoFocus
              placeholder="https://www.tiktok.com/@..."
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !importing) handleImport();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={importing || !importUrl.trim()}>
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Import
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      {editing && (
        <EditRecipeDialog
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: ["favorites"] });
            await queryClient.invalidateQueries({ queryKey: ["cookbook"] });
            await queryClient.invalidateQueries({ queryKey: ["recipe"] });
            setEditing(null);
          }}
        />
      )}

      {/* Planner dialog */}
      {planning && user && (
        <PlanDialog
          item={planning}
          userId={user.id}
          onClose={() => setPlanning(null)}
          onDone={async () => {
            await queryClient.invalidateQueries({ queryKey: ["planner"] });
            setPlanning(null);
          }}
        />
      )}
    </main>
  );
}

function IconAction({
  icon: Icon,
  title,
  onClick,
  variant = "default",
  disabled,
}: {
  icon: typeof Heart;
  title: string;
  onClick: () => void;
  variant?: "default" | "danger" | "fav";
  disabled?: boolean;
}) {
  const base =
    "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border transition-colors disabled:opacity-50";
  const color =
    variant === "danger"
      ? "text-destructive hover:bg-destructive/10"
      : variant === "fav"
        ? "text-rose-500 hover:bg-rose-500/10"
        : "text-muted-foreground hover:bg-muted";
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${color}`}
    >
      <Icon className={`h-4 w-4 ${variant === "fav" ? "fill-current" : ""}`} />
    </button>
  );
}

function EditRecipeDialog({
  item,
  onClose,
  onSaved,
}: {
  item: CookbookItem;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [time, setTime] = useState<string>(
    item.cooking_time_minutes ? String(item.cooking_time_minutes) : "",
  );
  const [servings, setServings] = useState<string>(item.servings ? String(item.servings) : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateRecipeBasics({
        data: {
          id: item.id,
          name: name.trim() || item.name,
          description: description.trim() || undefined,
          cooking_time_minutes: time ? parseInt(time, 10) : null,
          servings: servings ? parseInt(servings, 10) : null,
        },
      });
      toast.success("Recipe updated");
      await onSaved();
    } catch (err) {
      toast.error("Couldn't save", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit recipe</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rname">Name</Label>
            <Input id="rname" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rdesc">Description</Label>
            <Textarea
              id="rdesc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rtime">Time (min)</Label>
              <Input
                id="rtime"
                type="number"
                min={0}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rserv">Servings</Label>
              <Input
                id="rserv"
                type="number"
                min={0}
                value={servings}
                onChange={(e) => setServings(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanDialog({
  item,
  userId,
  onClose,
  onDone,
}: {
  item: CookbookItem;
  userId: string;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [meal, setMeal] = useState("Dinner");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const { error } = await firebaseData.from("meal_plans").insert({
        user_id: userId,
        recipe_id: item.id,
        plan_date: date,
        meal_type: meal,
      });
      if (error) throw error;
      toast.success("Added to planner");
      await onDone();
    } catch (err) {
      toast.error("Couldn't add", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to meal planner</DialogTitle>
          <DialogDescription>{item.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pdate">Date</Label>
            <Input id="pdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Meal</Label>
            <Select value={meal} onValueChange={setMeal}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Breakfast", "Lunch", "Dinner", "Snack"].map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add to planner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
