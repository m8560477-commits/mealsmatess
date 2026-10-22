import { collection, doc, writeBatch } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { hasNutrition, ScanResultSchema, type ScanResult } from "@/lib/scanner";

/** Existing personal collections/rules; a failed nutrition write cannot leave a half-saved meal. */
export async function saveScanResult(
  result: ScanResult,
  options: {
    destination: "pantry" | "planner";
    date: string;
    mealType: string;
    logNutrition: boolean;
  },
) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in before saving this scan.");
  if (!navigator.onLine) throw new Error("Reconnect before saving. Your scan is still here.");
  const scan = ScanResultSchema.parse(result);
  const batch = writeBatch(db);
  const created_at = new Date().toISOString();
  const add = (path: string, fields: Record<string, unknown>) => {
    const ref = doc(collection(db, "users", user.uid, path));
    batch.set(ref, { ...fields, id: ref.id, user_id: user.uid, created_at });
  };
  if (options.destination === "pantry") {
    if (!scan.ingredients.length || scan.ingredient_source === "unknown")
      throw new Error("There are no supported ingredients to save.");
    for (const item of scan.ingredients)
      add("pantry", {
        name: item.name.slice(0, 160),
        ...(item.quantity ? { quantity: item.quantity } : {}),
        ...(item.category ? { category: item.category } : {}),
        source: "scan",
      });
  } else {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(options.date) ||
      !["Breakfast", "Lunch", "Dinner", "Snack"].includes(options.mealType)
    )
      throw new Error("Choose a valid date and meal type.");
    add("mealPlans", {
      plan_date: options.date,
      meal_type: options.mealType,
      custom_name: scan.name.slice(0, 160),
    });
    // The existing nutrition log stores meal portions, not arbitrary database 100g records.
    if (
      options.logNutrition &&
      scan.mode === "dish" &&
      scan.source === "ai" &&
      hasNutrition(scan.nutrition)
    ) {
      const n = scan.nutrition!;
      add("nutritionLogs", {
        name: scan.name.slice(0, 160),
        meal_type: options.mealType,
        logged_at: new Date(`${options.date}T12:00:00`).toISOString(),
        calories: n.calories,
        protein_g: n.protein_g,
        carbs_g: n.carbs_g,
        fat_g: n.fat_g,
        servings: 1,
      });
    }
  }
  await batch.commit();
}
