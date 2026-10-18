import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { requirePremiumAccess } from "@/lib/entitlements.server";
import { getFirebaseServerServices } from "@/server/firebase-admin";
const Id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const Text = z.string().trim().min(1).max(160);
const Base = z.object({
  id: Id.optional(),
  user_id: z.string().optional(),
  created_at: z.string().max(40).optional(),
});
const Favorite = Base.extend({ recipe_id: Id });
const Grocery = Base.extend({
  name: Text,
  checked: z.boolean().default(false),
  category: z.string().max(80).nullable().optional(),
  quantity: z.string().max(80).nullable().optional(),
});
const Plan = Base.extend({
  plan_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal_type: z.string().min(1).max(40),
  recipe_id: Id.nullable().optional(),
  custom_name: Text.nullable().optional(),
});
const Nutrition = Base.extend({
  name: Text,
  meal_type: z.string().max(40),
  logged_at: z.string().max(40),
  calories: z.number().min(0).max(10000).nullable().optional(),
  protein_g: z.number().min(0).max(1000).nullable().optional(),
  carbs_g: z.number().min(0).max(1000).nullable().optional(),
  fat_g: z.number().min(0).max(1000).nullable().optional(),
  servings: z.number().positive().max(100).optional(),
});
const paths = {
  favorites: "favorites",
  grocery_items: "grocery",
  meal_plans: "mealPlans",
  nutrition_logs: "nutritionLogs",
} as const;
const schemas = {
  favorites: Favorite,
  grocery_items: Grocery,
  meal_plans: Plan,
  nutrition_logs: Nutrition,
};
export const writePersonalItems = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        table: z.enum(["favorites", "grocery_items", "meal_plans", "nutrition_logs"]),
        action: z.enum(["insert", "update"]),
        rows: z.array(z.record(z.unknown())).min(1).max(100),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await requirePremiumAccess(context.userId);
    const { db } = getFirebaseServerServices();
    const collection = db.collection("users").doc(context.userId).collection(paths[data.table]);
    const rows = data.rows.map((raw) => {
      const row = schemas[data.table].parse(raw);
      if (row.user_id && row.user_id !== context.userId)
        throw new Error("Forbidden: account mismatch.");
      return {
        ...row,
        id: row.id ?? collection.doc().id,
        user_id: context.userId,
        created_at: row.created_at ?? new Date().toISOString(),
      };
    });
    await db.runTransaction(async (tx) => {
      const current = await Promise.all(rows.map((row) => tx.get(collection.doc(row.id))));
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const old = current[i]!;
        if (data.action === "insert" && old.exists) throw new Error("This item already exists.");
        if (data.action === "update" && (!old.exists || old.data()?.user_id !== context.userId))
          throw new Error("Item unavailable.");
        tx.set(collection.doc(row.id), {
          ...row,
          created_at: old.data()?.created_at ?? row.created_at,
        });
      }
    });
    return rows;
  });
