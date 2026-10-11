import { RecipeImage } from "@/components/recipe-image";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Search,
  SlidersHorizontal,
  Camera,
  Loader2,
  User as UserIcon,
  MessageCircleQuestion,
  ShoppingCart,
  Calendar,
  ChevronRight,
  Play,
  HeartPulse,
} from "lucide-react";
import { toast } from "sonner";
import {
  trendingRecipesQuery,
  southAfricanFavoritesQuery,
  myFavoritesQuery,
} from "@/lib/queries";
import { surpriseMe, generateRecipe } from "@/lib/ai.functions";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { getContinueCooking } from "@/lib/continue-cooking";
import { TrendingCard } from "@/components/recipe-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanStatusCard } from "@/components/plan-status-card";
import { XpChip } from "@/components/xp-chip";
import { AdSlot } from "@/components/ad-slot";
import { usePreferences } from "@/hooks/use-preferences";
import { personalize } from "@/lib/preferences";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MealMate — Cook the world, one recipe at a time" },
      { name: "description", content: "Discover South African favourites and global recipes, then plan, shop, and cook with MealMate." },
      { property: "og:title", content: "MealMate — Cook the world, one recipe at a time" },
      { property: "og:description", content: "Discover South African favourites and global recipes, then plan, shop, and cook with MealMate." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const CATEGORY_PILLS = [
  { label: "Breakfast", emoji: "🍳", search: { c: "Breakfast" } },
  { label: "Lunch", emoji: "🥣", search: { c: "Lunch" } },
  { label: "Dinner", emoji: "🍛", search: { c: "Dinner" } },
  { label: "Dessert", emoji: "🍰", search: { c: "Dessert" } },
  { label: "Snacks", emoji: "🍿", search: { c: "Snacks" } },
  { label: "South African", emoji: "🇿🇦", search: { c: "South African Favorites" } },
  { label: "Healthy", emoji: "🌿", search: { c: "Healthy Meals" } },
  { label: "Vegan", emoji: "🌱", search: { c: "Vegan" } },
] as const;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function Index() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const { preferences, hasPreferences } = usePreferences();
  const {
    data: trendingRaw = [],
    isLoading: trendingLoading,
    error: trendingError,
  } = useQuery(trendingRecipesQuery());
  const {
    data: southAfricanRaw = [],
    isLoading: southAfricanLoading,
    error: southAfricanError,
  } = useQuery(southAfricanFavoritesQuery());
  const recipeText = (r: { name: string; description?: string | null; cuisine?: string | null; category?: string | null; diet_tags?: string[] | null }) =>
    [r.name, r.description ?? null, r.cuisine ?? null, r.category ?? null, r.diet_tags ?? []];
  const trending = personalize(hasPreferences ? preferences : null, trendingRaw ?? [], recipeText);
  const southAfrican = southAfricanRaw
    ? personalize(hasPreferences ? preferences : null, southAfricanRaw, recipeText)
    : southAfricanRaw;
  const { data: favorites } = useQuery({ ...myFavoritesQuery(), enabled: !!user });
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<null | "search" | "surprise">(null);
  const continueCooking = getContinueCooking();

  const favoriteIds = new Set((favorites ?? []).map((f) => f.recipe_id));

  const firstName =
    (user?.user_metadata?.["full_name"] as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "there";

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || busy) return;
    setBusy("search");
    try {
      const { slug } = await generateRecipe({ data: { query: query.trim() } });
      navigate({ to: "/recipe/$slug", params: { slug } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const authError = /AUTH_REQUIRED|Unauthorized|Invalid user session|No authorization/i.test(message);
    const aiError = /AI_NOT_CONFIGURED|AI_REQUEST_FAILED|Groq|gateway/i.test(message);
    toast.error(authError ? "Your session expired" : "Couldn't cook that up", {
      description: authError
        ? "Please sign in again to cook a recipe."
        : aiError
          ? "The kitchen assistant is unavailable right now. Please try again."
          : "Try again in a moment.",
    });
    } finally {
      setBusy(null);
    }
  }

  async function handleSurprise() {
    if (busy) return;
    setBusy("surprise");
    try {
      const { slug } = await surpriseMe();
      navigate({ to: "/recipe/$slug", params: { slug } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const authError = /AUTH_REQUIRED|Unauthorized|Invalid user session|No authorization/i.test(message);
      toast.error(authError ? "Your session expired" : "The chef is busy", {
        description: authError
          ? "Please sign in again to cook a recipe."
          : "The kitchen assistant is unavailable right now. Please try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function toggleFavorite(recipeId: string) {
    if (!user) {
      toast.info("Sign in to save favorites");
      return;
    }
    if (favoriteIds.has(recipeId)) {
      await supabase.from("favorites").delete().eq("user_id", user.id).eq("recipe_id", recipeId);
    } else {
      await supabase.from("favorites").insert({ user_id: user.id, recipe_id: recipeId });
    }
    queryClient.invalidateQueries({ queryKey: ["favorites"] });
  }

  return (
    <main className="flex-1">
      {/* Greeting header */}
      <div className="flex items-center justify-between px-4 pt-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {greeting()}
          </p>
          <h1 className="font-display text-4xl leading-tight">
            Hi {firstName} <span aria-hidden>👋</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <XpChip />
          <ThemeToggle />
          <Link
            to="/profile"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
            aria-label="Profile"
          >
            <UserIcon className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="px-4 pt-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes, ingredients, cuisines…"
            className="h-14 rounded-full border-none bg-card pl-11 pr-14 text-base shadow-sm"
          />
          <button
            type="submit"
            disabled={busy !== null}
            aria-label="Search"
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {busy === "search" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SlidersHorizontal className="h-4 w-4" />
            )}
          </button>
        </div>
      </form>

      {/* Category pills */}
      <section className="px-4 pt-5">
        <div className="flex flex-wrap gap-2">
          {CATEGORY_PILLS.map((c) => (
            <Link
              key={c.label}
              to="/recipes"
              search={c.search}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <span aria-hidden>{c.emoji}</span>
              {c.label}
            </Link>
          ))}
          <Link
            to="/recipes"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <span aria-hidden>⊞⊞</span>
            More
          </Link>
        </div>
      </section>

      {/* Hero cards: AI Kitchen Scan + Surprise Me */}
      <section className="grid grid-cols-2 gap-3 px-4 pt-6">
        <Link
          to="/scan"
          className="group relative flex flex-col justify-between overflow-hidden rounded-3xl bg-ink p-5 text-background"
        >
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-background/60">
              AI Kitchen Scan
            </p>
            <h2 className="mt-2 font-display text-2xl leading-tight">
              What's in your kitchen?
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-background/70">
              Point your camera at the fridge or pantry — we'll log every ingredient
              automatically.
            </p>
          </div>
          <span className="pointer-events-none absolute right-4 top-4 flex h-14 w-14 items-center justify-center rounded-full border border-background/20">
            <Camera className="h-5 w-5" />
          </span>
          <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-background px-4 py-2 text-xs font-semibold text-foreground">
            <Camera className="h-3.5 w-3.5" />
            Scan now
          </span>
        </Link>

        <button
          type="button"
          onClick={handleSurprise}
          disabled={busy !== null}
          className="group relative flex flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-ink via-ink to-primary/40 p-5 text-left text-background"
        >
          <div>
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="mt-2 font-display text-2xl leading-tight text-primary">
              Surprise Me
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-background/70">
              Get a random recipe made just for you!
            </p>
          </div>
          <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-background px-4 py-2 text-xs font-semibold text-foreground">
            {busy === "surprise" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Surprise me
          </span>
        </button>
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-4 gap-2 px-4 pt-6">
        {[
          { to: "/coach", icon: HeartPulse, label: "Nutrition Coach", sub: "Personalized food advice" },
          { to: "/chat", icon: MessageCircleQuestion, label: "AI Chat", sub: "Ask anything about food" },
          { to: "/scan", icon: Camera, label: "Scan Ingredients", sub: "Use your camera to scan items" },
          { to: "/planner", icon: Calendar, label: "Meal Planner", sub: "Plan your meals for the week" },
        ].map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-2 py-4 text-center transition-colors hover:bg-muted"
          >
            <a.icon className="h-5 w-5" />
            <span className="text-xs font-semibold leading-tight">{a.label}</span>
            <span className="hidden text-[10px] leading-tight text-muted-foreground sm:block">
              {a.sub}
            </span>
          </Link>
        ))}
      </section>

      {/* Plan status + premium features */}
      <section className="px-4 pt-6">
        <PlanStatusCard />
      </section>

      {/* Sponsored (free plan only) */}
      <section className="px-4 pt-6">
        <AdSlot slot="home_feed" />
      </section>

      {/* Trending recipes */}
      <section className="pt-8">
        <div className="mb-3 flex items-end justify-between px-4">
          <h2 className="font-display text-2xl">Trending Recipes</h2>
          <Link
            to="/recipes"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            View all <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {trendingLoading ? (
          <div className="flex gap-4 overflow-x-auto px-4 pb-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-40 flex-shrink-0 rounded-2xl" />
            ))}
          </div>
        ) : trendingError ? (
          <div className="mx-4 rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="text-muted-foreground">Recipes are temporarily unavailable. You can still use the rest of MealMate.</p>
          </div>
        ) : trending.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {trending.map((r, i) => (
              <TrendingCard
                key={r.id}
                recipe={r}
                isFavorite={favoriteIds.has(r.id)}
                onToggleFavorite={toggleFavorite}
                priority={i < 2}
              />
            ))}
          </div>
        ) : (
          <div className="mx-4 rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="text-muted-foreground">
              No recipes yet — hit <strong>Surprise me</strong> above to create the first one!
            </p>
          </div>
        )}
      </section>

      {/* South African favourites */}
      <section className="pt-8">
        <div className="mb-3 flex items-end justify-between px-4">
          <h2 className="font-display text-2xl">South African Favourites</h2>
          <Link
            to="/recipes"
            search={{ c: "South African Favorites" }}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            View all <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {southAfricanLoading ? (
          <div className="flex gap-4 overflow-x-auto px-4 pb-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-24 flex-shrink-0 rounded-2xl" />
            ))}
          </div>
        ) : southAfricanError ? (
          <p className="px-4 text-sm text-muted-foreground">This section is temporarily unavailable.</p>
        ) : southAfrican.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {southAfrican.map((r) => (
              <Link
                key={r.id}
                to="/recipe/$slug"
                params={{ slug: r.slug }}
                className="w-24 flex-shrink-0 text-center"
              >
                <div className="aspect-square w-24 overflow-hidden rounded-2xl bg-muted">
                  <RecipeImage recipe={r} size="thumb" className="h-full w-full object-cover" />

                </div>
                <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-tight">{r.name}</p>
              </Link>
            ))}
          </div>
        ) : southAfrican ? (
          <div className="mx-4 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            South African recipes will show up here once you generate a few.
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto px-4 pb-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-24 flex-shrink-0 rounded-2xl" />
            ))}
          </div>
        )}
      </section>

      {/* Continue cooking */}
      {continueCooking && (
        <section className="px-4 pt-8">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="font-display text-2xl">Continue Cooking</h2>
            <Link
              to="/recipes"
              className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <Link
            to="/recipe/$slug"
            params={{ slug: continueCooking.slug }}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
          >
            <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
              <RecipeImage
                recipe={continueCooking}
                size="thumb"
                className="h-full w-full object-cover"
              />

            </div>
            <div className="flex-1">
              <p className="font-display text-lg leading-tight">{continueCooking.name}</p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${continueCooking.progress}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{continueCooking.progress}% complete</span>
                {continueCooking.cooking_time_minutes && (
                  <span>{continueCooking.cooking_time_minutes} min</span>
                )}
                {continueCooking.calories && <span>{continueCooking.calories} cal</span>}
              </div>
            </div>
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-ink text-background">
              <Play className="h-3.5 w-3.5 fill-current" />
            </span>
          </Link>
        </section>
      )}

      {/* Floating AI assistant */}
      <Link
        to="/chat"
        aria-label="AI Assistant"
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-full bg-ink text-background shadow-lg"
      >
        <Sparkles className="h-4 w-4" />
        <span className="text-[8px] font-medium leading-none">AI</span>
      </Link>
    </main>
  );
}
