import { collection, doc, writeBatch } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { ScannedDish } from "@/lib/ai.functions";

function ownedBatch(userId: string) {
  if (auth.currentUser?.uid !== userId) throw new Error("Sign in again before saving your scan.");
  return writeBatch(db);
}

/** Commit both records together so a failed nutrition write cannot leave a stray meal. */
export async function saveScannedDish(
  userId: string,
  dish: ScannedDish,
  planDate: string,
  mealType: string,
) {
  const batch = ownedBatch(userId);
  const plan = doc(collection(db, "users", userId, "mealPlans"));
  const nutrition = doc(collection(db, "users", userId, "nutritionLogs"));
  const created_at = new Date().toISOString();
  batch.set(plan, {
    id: plan.id,
    user_id: userId,
    plan_date: planDate,
    meal_type: mealType,
    custom_name: dish.name,
    created_at,
  });
  batch.set(nutrition, {
    id: nutrition.id,
    user_id: userId,
    name: dish.name,
    meal_type: mealType,
    logged_at: new Date(`${planDate}T12:00:00`).toISOString(),
    calories: dish.calories ?? null,
    protein_g: dish.protein_g ?? null,
    carbs_g: dish.carbs_g ?? null,
    fat_g: dish.fat_g ?? null,
    servings: 1,
    created_at,
  });
  await batch.commit();
}

export async function saveScannedIngredients(
  userId: string,
  items: { name: string; quantity?: string; category?: string }[],
) {
  if (!items.length || items.length > 40) throw new Error("Scan between 1 and 40 ingredients.");
  const batch = ownedBatch(userId);
  for (const item of items) {
    const ref = doc(collection(db, "users", userId, "pantry"));
    batch.set(ref, {
      id: ref.id,
      user_id: userId,
      name: item.name,
      // Optional strings must be absent, rather than null, to satisfy the existing rules.
      ...(item.quantity != null ? { quantity: item.quantity } : {}),
      ...(item.category != null ? { category: item.category } : {}),
      source: "scan",
      created_at: new Date().toISOString(),
    });
  }
  await batch.commit();
}
