import { Link } from "@tanstack/react-router";
import { Clock, Flame, Heart } from "lucide-react";
import { RecipeImage } from "@/components/recipe-image";

export interface RecipeCardData {
  slug: string;
  name: string;
  image_url: string | null;
  cooking_time_minutes: number | null;
  cuisine: string | null;
  category: string | null;
  diet_tags?: string[] | null;
}

export interface TrendingCardData {
  id: string;
  slug: string;
  name: string;
  image_url: string | null;
  cooking_time_minutes: number | null;
  calories: number | null;
  difficulty: string | null;
  cuisine?: string | null;
  category?: string | null;
}

const DIFFICULTY_DOTS: Record<string, number> = { Easy: 1, Medium: 2, Hard: 3 };

/** Horizontal-rail card used on the home screen — image with overlaid time/cal
 * badge and a favorite heart, name, and a difficulty pill below. */
export function TrendingCard({
  recipe,
  isFavorite,
  onToggleFavorite,
  priority = false,
}: {
  recipe: TrendingCardData;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  /** Above-the-fold cards load eagerly; everything else lazily. */
  priority?: boolean;
}) {
  const dots = recipe.difficulty ? DIFFICULTY_DOTS[recipe.difficulty] ?? 1 : 1;
  return (
    <div className="w-40 flex-shrink-0">
      <Link
        to="/recipe/$slug"
        params={{ slug: recipe.slug }}
        className="md3-surface group relative block aspect-square w-40 overflow-hidden rounded-2xl bg-muted"
      >
        <RecipeImage
          recipe={recipe}
          size="card"
          priority={priority}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onToggleFavorite(recipe.id);
          }}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={isFavorite}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur"
        >
          <Heart className={isFavorite ? "h-4 w-4 fill-primary text-primary" : "h-4 w-4"} />
        </button>
        {(recipe.cooking_time_minutes || recipe.calories) && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-ink/80 px-2 py-1 text-[11px] font-medium text-background backdrop-blur">
            {recipe.cooking_time_minutes ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {recipe.cooking_time_minutes} min
              </span>
            ) : null}
            {recipe.calories ? (
              <span className="inline-flex items-center gap-1">
                <Flame className="h-3 w-3 text-primary" />
                {recipe.calories} cal
              </span>
            ) : null}
          </div>
        )}
      </Link>
      <h3 className="mt-2 line-clamp-2 font-display text-base leading-tight">{recipe.name}</h3>
      {recipe.difficulty && (
        <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
          {recipe.difficulty}
          <span className="flex items-center gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${i < dots ? "bg-primary" : "bg-border"}`}
              />
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

export function RecipeCard({ recipe }: { recipe: RecipeCardData }) {
  return (
    <Link
      to="/recipe/$slug"
      params={{ slug: recipe.slug }}
      className="md3-surface group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
        <RecipeImage
          recipe={recipe}
          size="card"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {recipe.cuisine && <span>{recipe.cuisine}</span>}
          {recipe.cooking_time_minutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {recipe.cooking_time_minutes}m
            </span>
          ) : null}
        </div>
        <h3 className="font-display text-xl leading-tight">{recipe.name}</h3>
        {recipe.diet_tags && recipe.diet_tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {recipe.diet_tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
