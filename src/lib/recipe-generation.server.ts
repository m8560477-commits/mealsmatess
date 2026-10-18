import { z } from "zod";
import { generateAiObject } from "@/lib/ai-engine.server";
import { slugify } from "@/lib/slug";
import { curatedRecipeImageUrl } from "@/lib/recipe-image";
export const RecipeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).max(600),
  cuisine: z.string().nullable().optional(),
  category: z
    .enum(["Breakfast", "Lunch", "Dinner", "Dessert", "Snacks", "Drinks"])
    .nullable()
    .optional(),
  country: z.string().nullable().optional(),
  diet_tags: z.array(z.string()).default([]),
  meal_type: z.string().nullable().optional(),
  cooking_time_minutes: z.number().int().min(1).max(720).nullable().optional(),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).nullable().optional(),
  servings: z.number().int().min(1).max(24).nullable().optional(),
  calories: z.number().int().min(0).max(10000).nullable().optional(),
  protein_g: z.number().min(0).max(1000).nullable().optional(),
  carbs_g: z.number().min(0).max(1000).nullable().optional(),
  fat_g: z.number().min(0).max(1000).nullable().optional(),
  ingredients: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(180),
        quantity: z.string().trim().min(1).max(80),
      }),
    )
    .min(2)
    .max(40),
  steps: z.array(z.string().trim().min(1).max(700)).min(4).max(12),
  fun_fact: z.string().nullable().optional(),
  image_prompt: z.string().nullable().optional(),
});

type GeneratedRecipe = z.infer<typeof RecipeSchema>;

const SYSTEM = `You are MealMate, an expert global chef and food writer with deep knowledge of South African cuisine (Pap, Chakalaka, Bunny Chow, Kota, Boerewors, Vetkoek, Mogodu, Samp and Beans, Malva Pudding, Bobotie, Umngqusho) as well as world cuisines.

Return ONLY valid JSON matching this shape (no code fences, no commentary). Avoid claiming precision for nutrition: provide conservative rounded estimates per serving; the app labels these values as estimates. Always honor stated allergies and dietary restrictions, and never include an allergen even as a garnish or optional ingredient:
{
  "name": string,
  "description": string (1-2 sentences),
  "cuisine": string,
  "category": one of "Breakfast" | "Lunch" | "Dinner" | "Dessert" | "Snacks" | "Drinks",
  "country": string,
  "diet_tags": string[] (subset of ["Vegan","Vegetarian","High Protein","Low Carb","Gluten Free","Healthy","Quick"]),
  "meal_type": string,
  "cooking_time_minutes": number,
  "difficulty": "Easy" | "Medium" | "Hard",
  "servings": number,
  "calories": number (rough estimate per serving),
  "protein_g": number, "carbs_g": number, "fat_g": number (rough estimates per serving),
  "ingredients": [{ "name": string, "quantity": string }],
  "steps": string[] (5-10 clear steps),
  "fun_fact": string,
  "image_prompt": string (concise, food-photography style)
}`;

export async function callModel(prompt: string): Promise<GeneratedRecipe> {
  return generateAiObject({
    feature: "recipe.generate",
    instructions: SYSTEM,
    prompt,
    schema: RecipeSchema,
  });
}

function imageUrlFor(r: GeneratedRecipe): string | null {
  return curatedRecipeImageUrl({ slug: slugify(r.name), name: r.name }, "hero") ?? null;
}

export function toDbRecipe(r: GeneratedRecipe, userId: string | null) {
  const slug = `${slugify(r.name)}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    slug,
    name: r.name,
    description: r.description,
    image_url: imageUrlFor(r),
    cuisine: r.cuisine ?? null,
    category: r.category ?? null,
    country: r.country ?? null,
    diet_tags: r.diet_tags ?? [],
    meal_type: r.meal_type ?? null,
    cooking_time_minutes: r.cooking_time_minutes ?? null,
    difficulty: r.difficulty ?? null,
    servings: r.servings ?? 2,
    calories: r.calories ?? null,
    protein_g: r.protein_g ?? null,
    carbs_g: r.carbs_g ?? null,
    fat_g: r.fat_g ?? null,
    ingredients: r.ingredients ?? [],
    steps: r.steps ?? [],
    fun_fact: r.fun_fact ?? null,
    created_by: userId,
  };
}
