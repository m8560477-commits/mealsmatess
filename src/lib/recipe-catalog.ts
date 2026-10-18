function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function ingredient(value: unknown): { name: string; quantity: string }[] {
  if (typeof value === "string") return [{ name: value, quantity: "" }];
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  const name = text(row["name"]);
  return name ? [{ name, quantity: text(row["quantity"]) ?? "" }] : [];
}

/** Only public, serializable catalog fields used by recipe cards and cooking. */
export function recipeCatalogRecord(row: Record<string, unknown>) {
  const { id, slug, name } = row;
  if (
    typeof id !== "string" ||
    !id.trim() ||
    typeof slug !== "string" ||
    !slug.trim() ||
    typeof name !== "string" ||
    !name.trim()
  )
    return null;
  return {
    id,
    slug,
    name,
    description: text(row["description"]),
    cuisine: text(row["cuisine"]),
    category: text(row["category"]),
    country: text(row["country"]),
    diet_tags: Array.isArray(row["diet_tags"])
      ? row["diet_tags"].filter((tag): tag is string => typeof tag === "string")
      : [],
    meal_type: text(row["meal_type"]),
    cooking_time_minutes: number(row["cooking_time_minutes"]),
    difficulty: text(row["difficulty"]),
    servings: number(row["servings"]),
    calories: number(row["calories"]),
    protein_g: number(row["protein_g"]),
    carbs_g: number(row["carbs_g"]),
    fat_g: number(row["fat_g"]),
    ingredients: Array.isArray(row["ingredients"]) ? row["ingredients"].flatMap(ingredient) : [],
    steps: Array.isArray(row["steps"])
      ? row["steps"].flatMap((step: unknown) => {
          if (typeof step === "string") return [step];
          if (!step || typeof step !== "object") return [];
          const item = step as Record<string, unknown>;
          const value = text(item["text"]) ?? text(item["instruction"]) ?? text(item["step"]);
          return value ? [value] : [];
        })
      : [],
    fun_fact: text(row["fun_fact"]),
    created_by: text(row["created_by"]),
    image_url: text(row["image_url"]),
    image_source: text(row["image_source"]),
    image_attribution: text(row["image_attribution"]),
  };
}

export type CatalogRecipe = NonNullable<ReturnType<typeof recipeCatalogRecord>>;

function normalize(value: unknown): string {
  return typeof value === "string"
    ? value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";
}

export function filterRecipeCatalog(
  recipes: CatalogRecipe[],
  {
    category,
    search = "",
    limit = 60,
  }: { category?: string; search?: string; limit?: number } = {},
): CatalogRecipe[] {
  const selected = normalize(category);
  const terms = normalize(search).split(" ").filter(Boolean);
  return recipes
    .filter((recipe) => {
      const labels = [
        recipe.name,
        recipe.cuisine,
        recipe.category,
        recipe.country,
        ...(recipe.diet_tags ?? []),
      ].map(normalize);
      const southAfrican = [recipe.cuisine, recipe.category, recipe.country].some((value) =>
        normalize(value).includes("south africa"),
      );
      const categoryMatches =
        !selected ||
        selected === "all" ||
        (["south african", "south african favorites", "south african favourites"].includes(selected)
          ? southAfrican
          : labels.includes(selected === "healthy meals" ? "healthy" : selected));
      const ingredients = Array.isArray(recipe.ingredients)
        ? recipe.ingredients.map((ingredient) =>
            typeof ingredient === "string" ? ingredient : ingredient?.name,
          )
        : [];
      const text = [...labels, normalize(recipe.description), ...ingredients.map(normalize)].join(
        " ",
      );
      return categoryMatches && terms.every((term) => text.includes(term));
    })
    .slice(0, limit);
}
