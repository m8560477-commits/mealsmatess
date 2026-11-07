// Synthetic fixtures only; requires FIRESTORE_EMULATOR_HOST and refuses production.
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readRecipeCatalogPage } from "../src/lib/recipe-catalog.server";
import { invalidateRecipeCatalogCache } from "../src/lib/recipe-catalog-cache.server";
import { readRatingSummaries } from "../src/lib/rating-summary.server";
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Firestore emulator required");
const app = initializeApp({ projectId: "demo-mealmate-performance" }, "catalog-performance");
const db = getFirestore(app);
try {
  await db.recursiveDelete(db.collection("recipes"));
  await db.recursiveDelete(db.collection("recipe_ratings"));
  const batch = db.batch();
  for (let i = 0; i < 137; i++)
    batch.set(db.collection("recipes").doc(`dish-${String(i).padStart(3, "0")}`), {
      name: `Tomato stew ${i}`,
      slug: `tomato-stew-${i}`,
      created_at: "2026-10-01T00:00:00.000Z",
      category: "Dinner",
      ingredients: [{ name: i === 5 ? "chickpeas" : "tomato" }],
      steps: ["Cook"],
      image_url: `https://example.test/dish-${i}.webp`,
      image_source: "Synthetic test fixture",
      private_notes: "Never expose",
      image_signature: "internal",
    });
  batch.set(db.collection("recipes").doc("legacy"), {
    name: "Legacy crêpes",
    slug: "legacy-crepes",
    ingredients: ["oat milk"],
    diet_tags: ["Healthy"],
    country: "South Africa",
  });
  batch.set(db.collection("recipes").doc("timestamp"), {
    name: "Timestamp dish",
    slug: "timestamp-dish",
    created_at: Timestamp.fromMillis(Date.now()),
  });
  batch.set(db.collection("recipes").doc("no-name"), {
    slug: "malformed",
    created_at: "2026-10-02",
  });
  batch.set(db.collection("recipes").doc("null-date"), {
    name: "Null date",
    slug: "null-date",
    created_at: null,
  });
  batch.set(db.collection("recipe_ratings").doc("r1"), {
    recipe_id: "dish-005",
    rating: 5,
    user_id: "synthetic-a",
  });
  batch.set(db.collection("recipe_ratings").doc("r2"), {
    recipe_id: "dish-005",
    rating: 3,
    user_id: "synthetic-b",
  });
  batch.set(db.collection("recipe_ratings").doc("invalid"), { recipe_id: "dish-005", rating: 9 });
  await batch.commit();
  invalidateRecipeCatalogCache();
  const started = performance.now();
  let reads = 0;
  const get = db.collection("recipes").limit(1).get;
  const queryPrototype = Object.getPrototypeOf(db.collection("recipes").limit(1));
  const originalGet = queryPrototype.get;
  queryPrototype.get = async function (...args: unknown[]) {
    const snapshot = await get.apply(this, args);
    reads += snapshot.size;
    return snapshot;
  };
  const [first, duplicate] = await Promise.all([
    readRecipeCatalogPage({ limit: 12 }, db),
    readRecipeCatalogPage({ limit: 12 }, db),
  ]);
  assert.deepEqual(first, duplicate);
  assert.equal(
    reads,
    24,
    "concurrent first pages read one bounded batch, not the full 141 documents",
  );
  await readRecipeCatalogPage({ limit: 12 }, db);
  assert.equal(reads, 24, "cached first page performs no more document reads");
  queryPrototype.get = originalGet;
  const firstMs = performance.now() - started;
  assert.equal(first.recipes.length, 12);
  assert.ok(first.nextCursor);
  assert.ok(first.recipes.every((r) => !("private_notes" in r) && !("image_signature" in r)));
  assert.ok(first.recipes.every((r) => r.steps.length === 0));
  const loaded = [...first.recipes];
  let cursor = first.nextCursor;
  let pages = 1;
  while (cursor) {
    const page = await readRecipeCatalogPage({ limit: 12, cursor }, db);
    loaded.push(...page.recipes);
    cursor = page.nextCursor;
    pages++;
    assert.ok(pages < 30);
  }
  assert.equal(loaded.length, 140);
  assert.equal(new Set(loaded.map((r) => r.id)).size, 140);
  assert.equal(loaded.at(-1)?.id, "legacy");
  assert.ok(loaded.some((r) => r.id === "timestamp"));
  assert.ok(loaded.some((r) => r.id === "null-date"));
  // Search must continue beyond its first scan; older matches remain reachable.
  const matches = [];
  let next: string | undefined;
  let searches = 0;
  do {
    const page = await readRecipeCatalogPage({ limit: 12, search: "OAT milk", cursor: next }, db);
    matches.push(...page.recipes);
    next = page.nextCursor ?? undefined;
    searches++;
  } while (next);
  assert.deepEqual(
    matches.map((r) => r.id),
    ["legacy"],
  );
  assert.ok(searches > 1);
  const summary = await readRatingSummaries(["dish-005", "absent"], db);
  assert.deepEqual(summary, { "dish-005": { average: 4, count: 2 }, absent: null });
  await assert.rejects(readRecipeCatalogPage({ limit: 12, cursor: "not-a-cursor" }, db));
  console.log(
    JSON.stringify({
      firstMs,
      firstPageDocumentReads: reads,
      repeatedPageAdditionalReads: 0,
      pages,
      recipes: loaded.length,
      legacySearchPages: searches,
      checks:
        "pagination, tied dates, Timestamp/null/missing dates, no duplicates, field projection, legacy ingredient search, aggregate ratings, invalid cursor passed",
    }),
  );
} finally {
  await db.terminate();
  await deleteApp(app);
}
