import { AggregateField, type Firestore } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/server/firebase-admin";
import type { RatingSummary } from "@/lib/rating-summary";
export async function readRatingSummaries(
  ids: string[],
  db: Firestore = getFirebaseAdminFirestore(),
) {
  const rows = await Promise.all(
    [...new Set(ids)].map(async (id) => {
      const result = await db
        .collection("recipe_ratings")
        .where("recipe_id", "==", id)
        .where("rating", ">=", 1)
        .where("rating", "<=", 5)
        .aggregate({ average: AggregateField.average("rating"), count: AggregateField.count() })
        .get();
      const { average, count } = result.data();
      return [
        id,
        count > 0 && typeof average === "number" && average >= 1 && average <= 5
          ? { average, count }
          : null,
      ] as const;
    }),
  );
  return Object.fromEntries(rows) as Record<string, RatingSummary>;
}
