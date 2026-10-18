import type { FoodPreferences } from "@/lib/preferences";

const GROUPS: Record<string, string[]> = {
  dairy: [
    "milk",
    "butter",
    "cream",
    "cheese",
    "yogurt",
    "yoghurt",
    "whey",
    "casein",
    "ghee",
    "mozzarella",
    "parmesan",
  ],
  milk: [
    "milk",
    "butter",
    "cream",
    "cheese",
    "yogurt",
    "yoghurt",
    "whey",
    "casein",
    "ghee",
    "mozzarella",
    "parmesan",
  ],
  gluten: [
    "wheat",
    "barley",
    "rye",
    "semolina",
    "couscous",
    "bulgur",
    "flour",
    "bread",
    "pasta",
    "noodle",
    "soy sauce",
  ],
  wheat: ["wheat", "semolina", "couscous", "bulgur", "flour", "bread", "pasta"],
  peanut: ["peanut", "groundnut"],
  "tree nut": [
    "almond",
    "walnut",
    "cashew",
    "pecan",
    "hazelnut",
    "pistachio",
    "macadamia",
    "brazil nut",
  ],
  nut: [
    "peanut",
    "groundnut",
    "almond",
    "walnut",
    "cashew",
    "pecan",
    "hazelnut",
    "pistachio",
    "macadamia",
    "brazil nut",
  ],
  egg: ["egg", "mayonnaise", "meringue"],
  soy: ["soy", "soya", "tofu", "tempeh", "edamame", "miso"],
  shellfish: [
    "shrimp",
    "prawn",
    "crab",
    "lobster",
    "mussel",
    "oyster",
    "clam",
    "scallop",
    "crayfish",
  ],
  fish: ["fish", "salmon", "tuna", "hake", "sardine", "anchovy", "cod", "trout", "snoek"],
  sesame: ["sesame", "tahini"],
};
const MEAT = [
  "chicken",
  "beef",
  "pork",
  "bacon",
  "ham",
  "lamb",
  "mutton",
  "turkey",
  "duck",
  "venison",
  "gelatin",
  "gelatine",
  "lard",
  "sausage",
  "mince",
];
function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function singular(value: string) {
  return value.replace(/s$/, "");
}
export function prohibitedIngredients(p: FoodPreferences) {
  const terms = [...p.allergies, ...p.disliked_foods];
  for (const diet of [...p.diets, ...p.dietary_restrictions]) {
    const value = normalize(diet);
    if (["vegan", "vegetarian", "pescatarian"].includes(value)) terms.push(...MEAT);
    if (["vegan", "vegetarian"].includes(value)) terms.push("fish", "shellfish");
    if (value === "vegan") terms.push("dairy", "egg", "honey");
    if (/gluten[ -]?free|no gluten/.test(value)) terms.push("gluten");
    else if (/dairy[ -]?free|lactose[ -]?free|no dairy/.test(value)) terms.push("dairy");
    else if (/nut[ -]?free/.test(value)) terms.push("nut");
    else if (/halal|kosher/.test(value)) terms.push("pork", "bacon", "ham", "lard", "wine", "beer");
    else if (
      ![
        "vegan",
        "vegetarian",
        "pescatarian",
        "high protein",
        "no specific diet",
        "no specific preference",
        "low carb",
        "keto",
      ].includes(value)
    )
      terms.push(diet.replace(/^(no|avoid)\s+/i, ""));
  }
  return [
    ...new Set(
      terms
        .flatMap((term) => {
          const key = singular(normalize(term));
          return GROUPS[key] ?? [key];
        })
        .filter(Boolean),
    ),
  ];
}
export function conflictsWithText(p: FoodPreferences, text: string) {
  const normalized = ` ${normalize(text).split(" ").map(singular).join(" ")} `;
  return prohibitedIngredients(p).some((term) =>
    normalized.includes(` ${normalize(term).split(" ").map(singular).join(" ")} `),
  );
}
export function recipeMatchesDiet(
  p: FoodPreferences,
  recipe: { name?: unknown; description?: unknown; ingredients?: unknown },
) {
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients
        .map((item) => (typeof item === "string" ? item : String(item?.name ?? item?.item ?? "")))
        .filter(Boolean)
    : [];
  if (prohibitedIngredients(p).length && !ingredients.length) return false;
  return !conflictsWithText(p, [recipe.name, ...ingredients].filter(Boolean).join(" "));
}
