import { UtensilsCrossed } from "lucide-react";
import { useEffect, useState } from "react";
import {
  categoryFallbackUrl,
  curatedRecipeImageUrl,
  IMAGE_DIMENSIONS,
  type ImageRecipeLike,
  type ImageSize,
} from "@/lib/recipe-image";
/**
 * Renders a recipe photo that always depicts the dish (or a neutral category
 * placeholder). Order: verified stored photo -> audited bundled photo ->
 * category placeholder while a verified photo is looked up once in the background.
 */
export function RecipeImage({
  recipe,
  size = "card",
  className,
  priority = false,
  alt,
  generating = false,
}: {
  generating?: boolean;
  recipe: ImageRecipeLike;
  size?: ImageSize;
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  const stored = recipe.image_source && recipe.image_url ? recipe.image_url : null;
  const curated = curatedRecipeImageUrl(recipe, size);
  const fallback = categoryFallbackUrl(recipe);
  const initial = stored ?? curated ?? fallback;
  const [src, setSrc] = useState(initial);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(initial);
    setFailed(false);
  }, [initial, stored, curated, recipe.id]);

  if (generating && !stored) {
    return (
      <div
        role="img"
        aria-label={`Creating a photo of ${recipe.name}`}
        className={`relative flex animate-pulse flex-col items-center justify-center gap-2 bg-muted text-muted-foreground ${className ?? ""}`}
      >
        <UtensilsCrossed className="h-8 w-8 opacity-40" />
        <span className="text-xs font-medium">Plating your photo…</span>
      </div>
    );
  }
  if (src === fallback || failed)
    return (
      <div
        role="img"
        aria-label={`Photo not available for ${recipe.name}`}
        className={`flex items-center justify-center bg-muted text-muted-foreground ${className ?? ""}`}
      >
        <UtensilsCrossed className="h-10 w-10 opacity-40" />
      </div>
    );

  const isGenerated = !!stored && recipe.image_source === "AI";
  const isCuratedFallback = !stored && !!curated && src === curated;

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      <img
        src={src}
        alt={alt ?? recipe.name}
        width={IMAGE_DIMENSIONS[size].width}
        height={IMAGE_DIMENSIONS[size].height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        onError={() => {
          if (curated && src !== curated) setSrc(curated);
          else setFailed(true);
        }}
        className="h-full w-full object-cover"
      />
      {(isGenerated || isCuratedFallback) && (
        <span className="absolute bottom-2 left-2 rounded-full bg-background/90 px-2 py-1 text-[10px] font-semibold text-foreground">
          {isGenerated ? "AI-generated" : "Curated photo"}
        </span>
      )}
    </div>
  );
}
