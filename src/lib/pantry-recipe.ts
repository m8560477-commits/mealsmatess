export function pantryRecipeQuery(names: string[]): string | null {
  const ingredients = names
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 12);
  if (!ingredients.length) return null;
  return `Make a meal using my pantry: ${ingredients.join(", ")}. Prioritize these ingredients.`.slice(
    0,
    200,
  );
}
