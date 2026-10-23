import { UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import {
  IMAGE_DIMENSIONS,
  NEUTRAL_RECIPE_PLACEHOLDER,
  recipePhotoSources,
  type ImageRecipeLike,
  type ImageSize,
} from "@/lib/recipe-image";

type RecipeImageProps = {
  generating?: boolean;
  recipe: ImageRecipeLike;
  size?: ImageSize;
  className?: string;
  priority?: boolean;
  alt?: string;
  sizes?: string;
};

/** Rendering is network-cost free: stored photo, exact curated dish, branded fallback. */
export function RecipeImage(props: RecipeImageProps) {
  const { recipe, size = "card" } = props;
  return (
    <RecipePhoto
      key={`${recipe.id}:${recipe.slug}:${recipe.name}:${recipe.image_source}:${recipe.image_url}:${size}`}
      {...props}
    />
  );
}

function RecipePhoto({
  recipe,
  size = "card",
  className,
  priority = false,
  alt,
  generating = false,
  sizes,
}: RecipeImageProps) {
  const [useCurated, setUseCurated] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState<string | null>(null);
  const { src, srcSet } = recipePhotoSources(recipe, size, useCurated);
  const unavailable = failed || src === NEUTRAL_RECIPE_PLACEHOLDER;
  const creating = generating && unavailable;

  return (
    <div
      className={`relative isolate overflow-hidden bg-muted ${className ?? ""}`}
      style={{ aspectRatio: "1 / 1" }}
    >
      {unavailable ? (
        <div
          role="img"
          aria-label={
            creating
              ? `Creating a photo of ${recipe.name}`
              : `Photo not available for ${recipe.name}`
          }
          className="flex h-full w-full flex-col items-center justify-center gap-2 p-2 text-muted-foreground"
        >
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full border border-current/20 ${creating ? "motion-safe:animate-pulse" : ""}`}
          >
            <UtensilsCrossed className="h-5 w-5" strokeWidth={1.25} />
          </div>
          <span className="text-[9px] font-semibold uppercase tracking-[0.2em]">MealMate</span>
          {creating && <span className="text-xs">Plating your photo…</span>}
        </div>
      ) : (
        <>
          {loaded !== src && (
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-foreground/5 motion-safe:animate-pulse"
            />
          )}
          <img
            key={src}
            src={src}
            srcSet={srcSet}
            sizes={
              sizes ??
              (size === "thumb"
                ? "96px"
                : size === "hero"
                  ? "(max-width: 768px) 100vw, 768px"
                  : "(max-width: 640px) 50vw, 320px")
            }
            alt={alt ?? recipe.name}
            width={IMAGE_DIMENSIONS[size].width}
            height={IMAGE_DIMENSIONS[size].height}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            ref={(img) => {
              if (img?.complete && img.naturalWidth > 0) setLoaded(src);
            }}
            onLoad={() => setLoaded(src)}
            onError={() => {
              const curated = recipePhotoSources(recipe, size, true);
              if (!useCurated && curated.src !== src && curated.src !== NEUTRAL_RECIPE_PLACEHOLDER)
                setUseCurated(true);
              else setFailed(true);
            }}
            className={`h-full w-full object-cover transition-opacity duration-300 motion-reduce:transition-none ${loaded === src ? "opacity-100" : "opacity-0"}`}
          />
        </>
      )}
    </div>
  );
}
