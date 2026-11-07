import { FieldPath, Timestamp, type Query, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { getFirebaseAdminFirestore } from "@/server/firebase-admin";
import { filterRecipeCatalog, recipeCatalogRecord, type CatalogRecipe } from "@/lib/recipe-catalog";
import { cachedCatalogPage } from "@/lib/recipe-catalog-cache.server";

const CursorSchema = z.object({
  phase: z.enum(["dated", "legacy"]),
  id: z
    .string()
    .min(1)
    .max(1500)
    .refine((id) => !id.includes("/"))
    .optional(),
  date: z
    .union([
      z.string().max(200),
      z.number().finite(),
      z.null(),
      z.object({ seconds: z.number().int(), nanoseconds: z.number().int().min(0).max(999999999) }),
    ])
    .optional(),
});
type Cursor = z.infer<typeof CursorSchema>;
export type CatalogPage = { recipes: CatalogRecipe[]; nextCursor: string | null };
export type CatalogPageInput = {
  category?: string;
  search?: string;
  limit: number;
  cursor?: string;
};
// Search needs ingredients; exclude methods/internal image-generation metadata from list reads.
const FIELDS = [
  "id",
  "slug",
  "name",
  "description",
  "cuisine",
  "category",
  "country",
  "diet_tags",
  "meal_type",
  "cooking_time_minutes",
  "difficulty",
  "servings",
  "calories",
  "image_url",
  "image_source",
  "image_attribution",
  "ingredients",
  "created_at",
];
function encode(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
function decode(cursor?: string): Cursor | undefined {
  if (!cursor) return undefined;
  try {
    return CursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw new Error("This recipe page has expired. Refresh the recipe list.");
  }
}
/** Bounded scans preserve substring/ingredient search and legacy rows without new schema fields. */
export async function readRecipeCatalogPage(
  input: CatalogPageInput,
  db: Firestore = getFirebaseAdminFirestore(),
): Promise<CatalogPage> {
  const cursor = decode(input.cursor);
  const phase = cursor?.phase ?? "dated";
  const batchSize = Math.min(60, Math.max(input.limit, 24));
  const key = JSON.stringify([phase, input.cursor ?? "", batchSize]);
  const candidates = await cachedCatalogPage(key, async () => {
    let query: Query = db.collection("recipes");
    if (phase === "dated")
      query = query.orderBy("created_at", "desc").orderBy(FieldPath.documentId(), "desc");
    else query = query.orderBy(FieldPath.documentId());
    if (cursor?.id) {
      if (phase === "dated") {
        if (cursor.date === undefined) throw new Error("Invalid recipe cursor.");
        const date =
          typeof cursor.date === "object" && cursor.date !== null
            ? new Timestamp(cursor.date.seconds, cursor.date.nanoseconds)
            : cursor.date;
        query = query.startAfter(date, cursor.id);
      } else query = query.startAfter(cursor.id);
    }
    const snapshot = await query
      .select(...FIELDS)
      .limit(batchSize)
      .get();
    return snapshot.docs.map((doc): Record<string, any> & { id: string } => ({
      ...doc.data(),
      id: doc.id,
    }));
  });
  const recipes: CatalogRecipe[] = [];
  let last: Cursor | undefined;
  let processed = 0;
  for (const row of candidates) {
    processed++;
    const date = row["created_at"];
    last = {
      phase,
      id: row.id,
      ...(phase === "dated"
        ? {
            date:
              date instanceof Timestamp
                ? { seconds: date.seconds, nanoseconds: date.nanoseconds }
                : (date ?? null),
          }
        : {}),
    };
    // orderBy excludes missing fields. Scan legacy documents only after dated rows end.
    if (phase === "legacy" && date !== undefined) continue;
    const recipe = recipeCatalogRecord(row);
    if (recipe && filterRecipeCatalog([recipe], { ...input, limit: 1 }).length) {
      recipes.push({ ...recipe, ingredients: [] });
      if (recipes.length >= input.limit) break;
    }
  }
  const more = processed < candidates.length || candidates.length === batchSize;
  return {
    recipes,
    nextCursor:
      more && last ? encode(last) : phase === "dated" ? encode({ phase: "legacy" }) : null,
  };
}
