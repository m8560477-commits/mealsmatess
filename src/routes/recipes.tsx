import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { recipesByCategoryQuery } from "@/lib/queries";
import { generateRecipe, surpriseMe } from "@/lib/ai.functions";
import { ensureRecipeImage } from "@/lib/recipe-images.functions";
import { useServerFn } from "@tanstack/react-start";
import { RecipeCard } from "@/components/recipe-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const CATEGORIES = [
  "All",
  "Breakfast",
  "Lunch",
  "Dinner",
  "Dessert",
  "Snacks",
  "Drinks",
  "Vegan",
  "High Protein",
  "Quick",
];

type RecipeSearch = { c?: string; q?: string };

export const Route = createFileRoute("/recipes")({
  head: () => ({
    meta: [
      { title: "Discover recipes | MealMate" },
      {
        name: "description",
        content: "Browse South African favourites, global classics, and personalised recipe ideas.",
      },
      { property: "og:title", content: "Discover recipes | MealMate" },
      {
        property: "og:description",
        content: "Browse South African favourites, global classics, and personalised recipe ideas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): RecipeSearch => ({
    ...(typeof search["c"] === "string" ? { c: search["c"] } : {}),
    ...(typeof search["q"] === "string" ? { q: search["q"] } : {}),
  }),
  ssr: false,
  component: RecipesPage,
});

function RecipesPage() {
  const { c, q } = Route.useSearch();
  const active = c ?? "All";
  const navigate = useNavigate();
  const {
    data: recipes,
    isLoading,
    isError,
    refetch,
  } = useQuery(recipesByCategoryQuery(active !== "All" ? active : undefined, q));
  const [query, setQuery] = useState(q ?? "");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const findImage = useServerFn(ensureRecipeImage);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || busy) return;
    const term = query.trim();
    setBusy(true);
    try {
      await navigate({
        to: "/recipes",
        search: { ...(active !== "All" ? { c: active } : {}), q: term },
      });
      const matches = await queryClient.fetchQuery(
        recipesByCategoryQuery(active !== "All" ? active : undefined, term),
      );
      // Photos are created in the background so results show straight away.
      void (async () => {
        for (const recipe of matches.slice(0, 6)) {
          if (recipe.image_source && recipe.image_url) continue;
          const result = await findImage({ data: { recipeId: recipe.id } }).catch(() => null);
          if (!result) continue;
          if (result.imageUrl) await queryClient.invalidateQueries({ queryKey: ["recipes"] });
          if (result.reason === "limit") {
            toast.message("Daily photo allowance reached", {
              description:
                "New recipe photos will be created again tomorrow. Upgrade to Premium for more.",
            });
            break;
          }
          if (result.reason === "rate_limited") break;
        }
      })();
    } catch {
      toast.error("Couldn't complete the search. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAiGenerate() {
    if (!query.trim() || busy) return;
    setBusy(true);
    try {
      const { slug } = await generateRecipe({ data: { query: query.trim() } });
      navigate({ to: "/recipe/$slug", params: { slug } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const authError = /AUTH_REQUIRED|Unauthorized|Invalid user session|No authorization/i.test(
        message,
      );
      toast.error(authError ? "Your session expired" : "Couldn't generate that recipe", {
        description: authError
          ? "Please sign in again to cook a recipe."
          : "The kitchen assistant is unavailable right now. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSurprise() {
    if (busy) return;
    setBusy(true);
    try {
      const { slug } = await surpriseMe();
      navigate({ to: "/recipe/$slug", params: { slug } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const authError = /AUTH_REQUIRED|Unauthorized|Invalid user session|No authorization/i.test(
        message,
      );
      toast.error(authError ? "Your session expired" : "The chef is busy", {
        description: authError
          ? "Please sign in again to cook a recipe."
          : "The kitchen assistant is unavailable right now. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl md:text-5xl">Discover recipes</h1>
        <p className="text-muted-foreground">
          Search our library — or ask the AI chef to invent something new.
        </p>
      </div>

      <form onSubmit={handleGenerate} className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Describe a dish or craving…"
            className="h-12 pl-9"
          />
        </div>
        <Button type="submit" size="lg" disabled={busy} className="h-12">
          Search
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={busy}
          className="h-12"
          onClick={handleAiGenerate}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask AI chef"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="h-12"
          onClick={handleSurprise}
          disabled={busy}
        >
          <Sparkles className="mr-2 h-4 w-4" /> Surprise
        </Button>
      </form>

      <div className="mt-6 flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <Link
            key={cat}
            to="/recipes"
            search={cat === "All" ? {} : { c: cat }}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              active === cat
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            {cat}
          </Link>
        ))}
      </div>

      <div className="mt-8">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/3] w-full rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">Recipes couldn&apos;t load right now.</p>
            <Button variant="outline" className="mt-4" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : recipes && recipes.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((r) => (
              <RecipeCard key={r.id} recipe={r as any} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">
              Nothing here yet. Try generating a recipe above!
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
