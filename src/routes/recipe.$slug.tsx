import { createFileRoute, notFound, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Clock,
  Users,
  Flame,
  Heart,
  ShoppingCart,
  ChefHat,
  Lightbulb,
  Loader2,
  Sparkles,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { recipeBySlugQuery, myFavoritesQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { usePremium } from "@/hooks/use-premium";
import { regenerateRecipeImage } from "@/lib/ai.functions";
import { ensureRecipeImage } from "@/lib/recipe-images.functions";
import { trackRecipeView } from "@/lib/engagement.functions";
import { setContinueCooking } from "@/lib/continue-cooking";
// Full-screen step-by-step mode — split out of the initial recipe page bundle.
const CookingMode = lazy(() =>
  import("@/components/cooking-mode").then((m) => ({ default: m.CookingMode })),
);
import { RecipeImage } from "@/components/recipe-image";
import { ChangeImageButton, ImageCredit } from "@/components/recipe-image-tools";
import { awardXp } from "@/lib/xp.functions";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { Button } from "@/components/ui/button";
import { SubstitutionsButton } from "@/components/substitutions-popover";
import { RecipeRatings } from "@/components/recipe-ratings";

export const Route = createFileRoute("/recipe/$slug")({
  loader: async ({ context, params }) => {
    const recipe = await context.queryClient.ensureQueryData(
      recipeBySlugQuery(params.slug),
    );
    if (!recipe) throw notFound();
    return recipe;
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: [
            { title: `${loaderData.name} — MealMate` },
            { name: "description", content: loaderData.description ?? undefined },
            { property: "og:title", content: `${loaderData.name} — MealMate` },
            ...(loaderData.image_url
              ? [{ property: "og:image", content: loaderData.image_url }]
              : []),
          ],
        }
      : {},
  component: RecipePage,
});

type Ingredient = { name: string; quantity?: string };

function RecipePage() {
  const recipe = Route.useLoaderData();
  const { data } = useQuery(recipeBySlugQuery(recipe.slug));
  const r = data ?? recipe;
  const { user } = useSession();
  const { isPremium } = usePremium();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: favorites } = useQuery({ ...myFavoritesQuery(), enabled: !!user });
  const [savingFav, setSavingFav] = useState(false);
  const [addingList, setAddingList] = useState(false);
  const [regen, setRegen] = useState(false);
  const [cookingOpen, setCookingOpen] = useState(false);
  const cookingModeEnabled = useFeatureFlag("cooking_mode", true);
  const [makingImage, setMakingImage] = useState(false);
  const imageAsked = useRef<string | null>(null);

  // Create this recipe's own photo once (in the background); afterwards it's reused for everyone.
  useEffect(() => {
    if (!user || !r.id || r.image_source || imageAsked.current === r.id) return;
    imageAsked.current = r.id;
    setMakingImage(true);
    ensureRecipeImage({ data: { recipeId: r.id } })
      .then(async (res) => {
        if (res.imageUrl) await queryClient.invalidateQueries({ queryKey: ["recipe", r.slug] });
        else if (res.reason === "limit") toast.message("Daily photo allowance reached", { description: "This recipe's photo will be created when your allowance resets. Premium includes more." });
      })
      .catch(() => undefined)
      .finally(() => setMakingImage(false));
  }, [user, r.id, r.image_source, r.slug, queryClient]);

  async function regenerateImage() {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (!isPremium) {
      toast.error("Upgrade to Premium to regenerate recipe images.");
      navigate({ to: "/premium" });
      return;
    }
    setRegen(true);
    try {
      await regenerateRecipeImage({ data: { slug: r.slug } });
      await queryClient.invalidateQueries({ queryKey: ["recipe", r.slug] });
      toast.success("New image generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to regenerate");
    } finally {
      setRegen(false);
    }
  }


  useEffect(() => {
    setContinueCooking({
      slug: r.slug,
      name: r.name,
      image_url: r.image_url,
      cooking_time_minutes: r.cooking_time_minutes,
      calories: r.calories,
    });
    if (user && r.id) {
      void trackRecipeView({ data: { recipeId: r.id } }).catch(() => {});
    }
  }, [r.slug, r.id, user]);

  const ingredients = (Array.isArray(r.ingredients) ? r.ingredients : []) as Ingredient[];
  const steps = (Array.isArray(r.steps) ? r.steps : []) as string[];
  const isFav = favorites?.some((f) => f.recipe_id === r.id) ?? false;

  const stats = [
    r.cooking_time_minutes && { icon: Clock, label: `${r.cooking_time_minutes} min` },
    r.servings && { icon: Users, label: `${r.servings} servings` },
    r.calories && { icon: Flame, label: `${r.calories} kcal` },
    r.difficulty && { icon: ChefHat, label: r.difficulty },
  ].filter(Boolean) as { icon: typeof Clock; label: string }[];

  async function toggleFavorite() {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    setSavingFav(true);
    try {
      if (isFav) {
        await supabase
          .from("favorites")
          .delete()
          .eq("recipe_id", r.id)
          .eq("user_id", user.id);
      } else {
        await supabase.from("favorites").insert({ recipe_id: r.id, user_id: user.id });
      }
      await queryClient.invalidateQueries({ queryKey: ["favorites"] });
    } catch {
      toast.error("Couldn't update favorites");
    } finally {
      setSavingFav(false);
    }
  }

  async function addToGrocery() {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (ingredients.length === 0) return;
    setAddingList(true);
    try {
      const rows = ingredients.map((ing) => ({
        user_id: user.id,
        recipe_id: r.id,
        name: ing.name,
        quantity: ing.quantity ?? null,
      }));
      const { error } = await supabase.from("grocery_items").insert(rows);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["grocery"] });
      toast.success("Added to your grocery list", {
        action: { label: "View", onClick: () => navigate({ to: "/list" }) },
      });
    } catch {
      toast.error("Couldn't add to grocery list");
    } finally {
      setAddingList(false);
    }
  }

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link
          to="/recipes"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          ← Back to recipes
        </Link>

        <div className="mt-4 grid gap-8 md:grid-cols-2">
          <div>
          <div className="overflow-hidden rounded-3xl bg-muted">
            <RecipeImage
              recipe={r}
              size="hero"
              priority
              generating={makingImage}
              className="aspect-square w-full object-cover"
            />

          </div>
          <div>
            <ImageCredit source={r.image_source} attribution={r.image_attribution} />
            {r.id && <ChangeImageButton recipe={{ id: r.id, slug: r.slug, created_by: r.created_by }} userId={user?.id} />}
          </div>
          </div>

          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {r.cuisine && <span>{r.cuisine}</span>}
              {r.country && <span>· {r.country}</span>}
              {r.category && <span>· {r.category}</span>}
            </div>
            <h1 className="mt-2 font-display text-4xl md:text-5xl">{r.name}</h1>
            {r.description && (
              <p className="mt-3 text-lg text-muted-foreground">{r.description}</p>
            )}

            {r.diet_tags && r.diet_tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {r.diet_tags.map((t: string) => (
                  <span
                    key={t}
                    className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-3 text-center"
                >
                  <s.icon className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium">{s.label}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={toggleFavorite} variant={isFav ? "default" : "secondary"} disabled={savingFav}>
                {savingFav ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Heart className={`mr-2 h-4 w-4 ${isFav ? "fill-current" : ""}`} />
                )}
                {isFav ? "Saved" : "Save"}
              </Button>
              <Button onClick={addToGrocery} variant="outline" disabled={addingList}>
                {addingList ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShoppingCart className="mr-2 h-4 w-4" />
                )}
                Add to list
              </Button>
              {cookingModeEnabled && steps.length > 0 && (
                <Button onClick={() => setCookingOpen(true)} variant="default">
                  <Play className="mr-2 h-4 w-4" />
                  Start cooking
                </Button>
              )}
              <Button onClick={regenerateImage} variant="outline" disabled={regen}>
                {regen ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {isPremium ? "Regenerate image" : "AI image (Premium)"}
              </Button>
            </div>
          </div>
        </div>

        {(r.protein_g || r.carbs_g || r.fat_g) && (
          <div className="mt-8 grid grid-cols-3 gap-3 rounded-2xl border border-border bg-card p-4">
            {[
              { label: "Protein", value: r.protein_g },
              { label: "Carbs", value: r.carbs_g },
              { label: "Fat", value: r.fat_g },
            ].map((m) => (
              <div key={m.label} className="text-center">
                <div className="font-display text-2xl">{m.value ?? "–"}g</div>
                <div className="text-xs text-muted-foreground">{m.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 grid gap-10 md:grid-cols-[1fr_1.5fr]">
          <section>
            <h2 className="font-display text-2xl">Ingredients</h2>
            <ul className="mt-4 space-y-2">
              {ingredients.map((ing, i) => (
                <li
                  key={i}
                  className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    {ing.name}
                    <SubstitutionsButton ingredient={ing.name} recipeName={r.name} />
                  </span>
                  {ing.quantity && (
                    <span className="shrink-0 text-muted-foreground">{ing.quantity}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl">Method</h2>
            <ol className="mt-4 space-y-4">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <p className="pt-0.5 text-sm leading-relaxed">{step}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {r.fun_fact && (
          <div className="mt-10 flex gap-3 rounded-2xl bg-secondary p-5">
            <Lightbulb className="h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm text-secondary-foreground">
              <strong>Did you know?</strong> {r.fun_fact}
            </p>
          </div>
        )}

        <RecipeRatings recipeId={r.id} />
      </div>
      {cookingOpen && (
        <Suspense fallback={null}>
        <CookingMode
          name={r.name}
          steps={steps}
          onClose={() => setCookingOpen(false)}
          onComplete={async () => {
            if (!user) return;
            try {
              const res = await awardXp({
                data: { action: "recipe_cooked", entityId: r.id },
              });
              if (res.awarded) {
                toast.success(`+${res.points} XP — well cooked!`);
                queryClient.invalidateQueries({ queryKey: ["gamification"] });
              }
            } catch {
              /* XP is best-effort */
            }
          }}
        />
        </Suspense>
      )}
    </main>
  );
}
