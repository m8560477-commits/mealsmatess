import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Curated allowlist — only these dish names can be tracked. Prevents junk data.
const ALLOWED = new Set([
  "Butter Chicken",
  "Chicken Alfredo Pasta",
  "Margherita Pizza",
  "Beef Burger",
  "Sushi Rolls",
  "Chicken Biryani",
  "Beef Tacos",
  "Ramen",
  "Pad Thai",
  "Butter Chicken Curry",
  "Lasagna",
  "Mac and Cheese",
  "Fried Chicken",
  "Grilled Salmon",
  "Chicken Caesar Salad",
  "Beef Steak",
  "Spaghetti Bolognese",
  "Shrimp Fried Rice",
  "Chicken Shawarma",
  "Fish and Chips",
  "Beef Stir-Fry",
  "Chicken Katsu",
  "Dumplings",
  "Chicken Noodle Soup",
  "Greek Salad",
  "BBQ Ribs",
  "Chicken Parmesan",
  "French Toast",
  "Pancakes",
  "Avocado Toast",
  "Eggs Benedict",
  "Chocolate Brownies",
  "Cheesecake",
]);

export const incrementDishSearch = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    z.object({ name: z.string().min(1).max(80) }).parse(v),
  )
  .handler(async ({ data }) => {
    const name = data.name.trim();
    if (!ALLOWED.has(name)) return { count: 0, tracked: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("dish_searches")
      .select("count")
      .eq("name", name)
      .maybeSingle();

    const nextCount = (existing?.count ?? 0) + 1;
    const { error } = await supabaseAdmin
      .from("dish_searches")
      .upsert({ name, count: nextCount, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { count: nextCount, tracked: true };
  });
