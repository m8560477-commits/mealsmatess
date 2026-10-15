import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const featuredRecipesQuery = () =>
  queryOptions({
    queryKey: ["recipes", "featured"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select(
          "id,slug,name,image_url,image_source,cooking_time_minutes,cuisine,category,diet_tags,calories,difficulty",
        )
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });

export const trendingRecipesQuery = () =>
  queryOptions({
    queryKey: ["recipes", "trending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select(
          "id,slug,name,image_url,image_source,cooking_time_minutes,cuisine,category,diet_tags,calories,difficulty",
        )
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

export const southAfricanFavoritesQuery = () =>
  queryOptions({
    queryKey: ["recipes", "south-african"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("id,slug,name,image_url,image_source")
        .or(
          "category.eq.South African Favorites,country.ilike.%south africa%,cuisine.ilike.%south african%",
        )
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

export const recipesByCategoryQuery = (category: string | undefined, search = "") =>
  queryOptions({
    queryKey: ["recipes", "category", category ?? "all", search.trim().toLowerCase()],
    queryFn: async () => {
      let q = supabase
        .from("recipes")
        .select(
          "id,slug,name,image_url,image_source,cooking_time_minutes,cuisine,category,diet_tags,country",
        )
        .order("created_at", { ascending: false })
        .limit(60);
      if (category) {
        q = q.or(
          `category.eq.${category},country.eq.${category},cuisine.eq.${category},diet_tags.cs.{${category}}`,
        );
      }
      if (search.trim()) {
        const term = search.trim().replace(/[(),]/g, " ");
        q = q.or(
          `name.ilike.%${term}%,cuisine.ilike.%${term}%,category.ilike.%${term}%,country.ilike.%${term}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const recipeBySlugQuery = (slug: string) =>
  queryOptions({
    queryKey: ["recipe", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const myFavoritesQuery = () =>
  queryOptions({
    queryKey: ["favorites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select(
          "recipe_id, recipes(id,slug,name,image_url,image_source,cooking_time_minutes,cuisine,category)",
        );
      if (error) throw error;
      return data ?? [];
    },
  });

export const myGroceryQuery = () =>
  queryOptions({
    queryKey: ["grocery"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grocery_items")
        .select("*")
        .order("checked", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const myPantryQuery = () =>
  queryOptions({
    queryKey: ["pantry"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pantry_items")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const myPlannerQuery = (fromISO: string, toISO: string) =>
  queryOptions({
    queryKey: ["planner", fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_plans")
        .select("*, recipes(id,slug,name,image_url,image_source,cuisine)")
        .gte("plan_date", fromISO)
        .lte("plan_date", toISO);
      if (error) throw error;
      return data ?? [];
    },
  });

export const myProfileQuery = () =>
  queryOptions({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", u.user.id)
        .maybeSingle();
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id);
      return { user: u.user, profile: data, roles: roles?.map((r) => r.role) ?? [] };
    },
  });

export const announcementsQuery = () =>
  queryOptions({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
