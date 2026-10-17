import { queryOptions } from "@tanstack/react-query";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";

const recipes = collection(db, "recipes");
type FirestoreRecord = any;
const recipeFields = (item: FirestoreRecord) => item;

const list = async (collectionName: string, constraints: Parameters<typeof query>[1][] = []): Promise<FirestoreRecord[]> => {
  try {
    const snapshot = await getDocs(query(collection(db, collectionName), ...constraints));
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionName);
    return [];
  }
}

export const featuredRecipesQuery = () => queryOptions({
  queryKey: ["recipes", "featured"],
  queryFn: async (): Promise<any> => (await list("recipes", [orderBy("created_at", "desc"), limit(12)])).map(recipeFields),
});

export const trendingRecipesQuery = () => queryOptions({
  queryKey: ["recipes", "trending"],
  queryFn: async (): Promise<any> => (await list("recipes", [orderBy("created_at", "desc"), limit(8)])).map(recipeFields),
});

export const southAfricanFavoritesQuery = () => queryOptions({
  queryKey: ["recipes", "south-african"],
  queryFn: async (): Promise<any> => {
    const items = await list("recipes", [limit(100)]);
    return items.filter((item) => [item.category, item.country, item.cuisine].some((value) => String(value ?? "").toLowerCase().includes("south african") || String(value ?? "").toLowerCase().includes("south africa"))).slice(0, 8).map(recipeFields);
  },
});

export const recipesByCategoryQuery = (category: string | undefined, search = "") => queryOptions({
  queryKey: ["recipes", "category", category ?? "all", search.trim().toLowerCase()],
  queryFn: async (): Promise<any> => {
    const term = search.trim().toLowerCase();
    const items = await list("recipes", [orderBy("created_at", "desc"), limit(100)]);
    return items.filter((item) => {
      const values = [item.name, item.cuisine, item.category, item.country, ...(Array.isArray(item.diet_tags) ? item.diet_tags : [])].map((value) => String(value ?? "").toLowerCase());
      return (!category || values.includes(category.toLowerCase())) && (!term || values.some((value) => value.includes(term)));
    }).slice(0, 60).map(recipeFields);
  },
});

export const recipeBySlugQuery = (slug: string) => queryOptions({
  queryKey: ["recipe", slug],
  queryFn: async (): Promise<any> => {
    const snapshot = await getDocs(query(recipes, where("slug", "==", slug), limit(1)));
    return snapshot.docs[0] ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null;
  },
});

export const myFavoritesQuery = () => queryOptions({
  queryKey: ["favorites"],
  queryFn: async (): Promise<any> => {
    const user = auth.currentUser;
    if (!user) return [];
    return list(`users/${user.uid}/favorites`, [orderBy("created_at", "desc")]);
  },
});

export const myGroceryQuery = () => queryOptions({
  queryKey: ["grocery"],
  queryFn: async (): Promise<any> => auth.currentUser ? list(`users/${auth.currentUser.uid}/grocery`, [orderBy("checked"), orderBy("created_at", "desc")]) : [],
});

export const myPantryQuery = () => queryOptions({
  queryKey: ["pantry"],
  queryFn: async (): Promise<any> => auth.currentUser ? list(`users/${auth.currentUser.uid}/pantry`, [orderBy("created_at", "desc")]) : [],
});

export const myPlannerQuery = (fromISO: string, toISO: string) => queryOptions({
  queryKey: ["planner", fromISO, toISO],
  queryFn: async (): Promise<any> => auth.currentUser ? list(`users/${auth.currentUser.uid}/mealPlans`, [where("plan_date", ">=", fromISO), where("plan_date", "<=", toISO), orderBy("plan_date")]) : [],
});

export const myProfileQuery = () => queryOptions({
  queryKey: ["profile"],
  queryFn: async (): Promise<any> => {
    const user = auth.currentUser;
    if (!user) return null;
    const profile = await getDoc(doc(db, "users", user.uid));
    return { user, profile: profile.exists() ? { id: profile.id, ...profile.data() } : null, roles: [] };
  },
});

export const announcementsQuery = () => queryOptions({
  queryKey: ["announcements"],
  queryFn: () => list("announcements", [orderBy("created_at", "desc"), limit(10)]),
});
