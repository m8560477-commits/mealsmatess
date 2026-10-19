import { queryOptions } from "@tanstack/react-query";
import { collection, getDocs, getDoc, doc, limit, orderBy, query, where } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";

import { listRecipeCatalog, getRecipeCatalogEntry } from "@/lib/recipe-catalog.functions";
import { recipeCatalogRecord } from "@/lib/recipe-catalog";
export type FirestoreRecord = Record<string, any> & {
  id: string;
  name?: string;
  slug?: string;
  description?: string | null;
  cuisine?: string | null;
  category?: string | null;
  country?: string | null;
  diet_tags?: string[] | null;
  recipe_id?: string;
  image_url?: string | null;
  image_source?: string | null;
  image_attribution?:
    | string
    | { photographer: string | null; photographerUrl: string | null; pageUrl: string | null }
    | null;
  cooking_time_minutes?: number | null;
  servings?: number | null;
  calories?: number | null;
  difficulty?: string | null;
  ingredients?: unknown;
  steps?: unknown;
  fun_fact?: string | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  checked?: boolean;
  quantity?: string | null;
  plan_date?: string;
  meal_type?: string;
  custom_name?: string | null;
  recipes?: RecipeRecord | null;
};
export type RecipeRecord = Omit<
  FirestoreRecord,
  | "name"
  | "slug"
  | "image_url"
  | "cooking_time_minutes"
  | "calories"
  | "servings"
  | "ingredients"
  | "steps"
> & {
  name: string;
  slug: string;
  image_url: string | null;
  cooking_time_minutes: number | null;
  calories: number | null;
  servings: number | null;
  ingredients: unknown;
  steps: unknown;
};
export type FavoriteRecord = FirestoreRecord & { recipe_id: string; recipes?: RecipeRecord | null };
export type MealPlanRecord = FirestoreRecord & {
  plan_date: string;
  meal_type: string;
  recipe_id?: string;
  recipes?: RecipeRecord | null;
};
export type GroceryRecord = FirestoreRecord & {
  name: string;
  checked: boolean;
  quantity?: string | null;
};
export type PantryRecord = FirestoreRecord & {
  name: string;
  expires_at?: string | null;
};

const list = async (
  collectionName: string,
  constraints: Parameters<typeof query>[1][] = [],
): Promise<FirestoreRecord[]> => {
  try {
    const snapshot = await getDocs(query(collection(db, collectionName), ...constraints));
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionName);
    return [];
  }
};

export const featuredRecipesQuery = () =>
  queryOptions({
    queryKey: ["recipes", "featured"],
    queryFn: () => listRecipeCatalog({ data: { limit: 12 } }),
  });

export const trendingRecipesQuery = () =>
  queryOptions({
    queryKey: ["recipes", "trending"],
    queryFn: () => listRecipeCatalog({ data: { limit: 8 } }),
  });

export const southAfricanFavoritesQuery = () =>
  queryOptions({
    queryKey: ["recipes", "south-african"],
    queryFn: () => listRecipeCatalog({ data: { category: "South African", limit: 8 } }),
  });

export const recipesByCategoryQuery = (category: string | undefined, search = "") =>
  queryOptions({
    queryKey: ["recipes", "category", category ?? "all", search.trim().toLowerCase()],
    queryFn: () => listRecipeCatalog({ data: { category, search } }),
  });

export const recipeBySlugQuery = (slug: string) =>
  queryOptions({
    queryKey: ["recipe", slug],
    queryFn: () => getRecipeCatalogEntry({ data: { slug } }),
  });

async function withRecipes<T extends FirestoreRecord>(rows: T[]): Promise<T[]> {
  const recipes = new Map<string, Promise<RecipeRecord | null>>();
  for (const row of rows) {
    if (row.recipe_id && !recipes.has(row.recipe_id)) {
      recipes.set(
        row.recipe_id,
        getDoc(doc(db, "recipes", row.recipe_id)).then((snapshot) =>
          snapshot.exists() ? recipeCatalogRecord({ id: snapshot.id, ...snapshot.data() }) : null,
        ),
      );
    }
  }
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      recipes: row.recipe_id ? await recipes.get(row.recipe_id)! : null,
    })),
  );
}

export const myFavoritesQuery = () =>
  queryOptions({
    queryKey: ["favorites"],
    queryFn: async (): Promise<FavoriteRecord[]> => {
      const user = auth.currentUser;
      if (!user) return [];
      return withRecipes(
        (await list(`users/${user.uid}/favorites`, [
          orderBy("created_at", "desc"),
        ])) as FavoriteRecord[],
      );
    },
  });

export const myGroceryQuery = () =>
  queryOptions({
    queryKey: ["grocery"],
    queryFn: async (): Promise<GroceryRecord[]> =>
      auth.currentUser
        ? ((await list(`users/${auth.currentUser.uid}/grocery`, [
            orderBy("checked"),
            orderBy("created_at", "desc"),
          ])) as GroceryRecord[])
        : [],
  });

export const myPantryQuery = () =>
  queryOptions<PantryRecord[]>({
    queryKey: ["pantry"],
    queryFn: async (): Promise<PantryRecord[]> =>
      auth.currentUser
        ? ((await list(`users/${auth.currentUser.uid}/pantry`, [
            orderBy("created_at", "desc"),
          ])) as PantryRecord[])
        : [],
  });

export const myPlannerQuery = (fromISO: string, toISO: string) =>
  queryOptions({
    queryKey: ["planner", fromISO, toISO],
    queryFn: async (): Promise<MealPlanRecord[]> =>
      auth.currentUser
        ? withRecipes(
            (await list(`users/${auth.currentUser.uid}/mealPlans`, [
              where("plan_date", ">=", fromISO),
              where("plan_date", "<=", toISO),
              orderBy("plan_date"),
            ])) as MealPlanRecord[],
          )
        : [],
  });

export const myProfileQuery = () =>
  queryOptions({
    queryKey: ["profile"],
    queryFn: async (): Promise<{
      user: typeof auth.currentUser;
      profile: FirestoreRecord | null;
      roles: string[];
    } | null> => {
      const user = auth.currentUser;
      if (!user) return null;
      const profile = await getDoc(doc(db, "users", user.uid));
      return {
        user,
        profile: profile.exists() ? { id: profile.id, ...profile.data() } : null,
        roles: [],
      };
    },
  });

export const announcementsQuery = () =>
  queryOptions({
    queryKey: ["announcements"],
    queryFn: () => list("announcements", [orderBy("created_at", "desc"), limit(10)]),
  });
