import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firebaseAdmin } from "@/server/firebase-admin";

// Keep the database boundary in memory while exercising the real query adapter.
const fixture = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type Ref = { table: string; id: string };
  const tables = new Map<string, Map<string, Row>>();
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };
  const read = (ref: Ref) => ({
    id: ref.id,
    ref,
    exists: table(ref.table).has(ref.id),
    data: () => table(ref.table).get(ref.id),
    get: (field: string) => table(ref.table).get(ref.id)?.[field],
  });
  const write = (ref: Ref, values: Row) =>
    table(ref.table).set(ref.id, { ...table(ref.table).get(ref.id), ...values });
  const collection = (name: string, filter?: { field: string; value: unknown }) => ({
    doc: (id: string) => ({ table: name, id }),
    where: (field: string, _operator: string, value: unknown) => collection(name, { field, value }),
    get: async () => ({
      docs: Array.from(table(name).keys())
        .map((id) => read({ table: name, id }))
        .filter((item) => !filter || item.get(filter.field) === filter.value),
    }),
  });
  return {
    tables,
    table,
    db: {
      collection,
      batch: () => {
        const pending: (() => void)[] = [];
        return {
          create: (ref: Ref, values: Row) => {
            pending.push(() => {
              if (table(ref.table).has(ref.id)) throw new Error("Already exists");
              write(ref, values);
            });
          },
          set: (ref: Ref, values: Row) => {
            pending.push(() => {
              write(ref, values);
            });
          },
          delete: (ref: Ref) => {
            pending.push(() => {
              table(ref.table).delete(ref.id);
            });
          },
          commit: async () => {
            pending.forEach((run) => run());
          },
        };
      },
      runTransaction: async (
        run: (transaction: {
          get: (ref: Ref) => Promise<ReturnType<typeof read>>;
          set: (ref: Ref, values: Row) => void;
        }) => Promise<unknown>,
      ) =>
        run({
          get: async (ref) => read(ref),
          set: (ref, values) => {
            write(ref, values);
          },
        }),
    },
  };
});
vi.mock("firebase-admin/app", () => ({
  cert: vi.fn(),
  getApps: () => [],
  initializeApp: () => ({}),
}));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({}) }));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => fixture.db,
  Timestamp: class Timestamp {},
}));
vi.mock("firebase-admin/messaging", () => ({ getMessaging: () => ({}) }));
vi.mock("firebase-admin/storage", () => ({
  getStorage: () => ({ bucket: () => ({}) }),
  getDownloadURL: vi.fn(),
}));

beforeEach(() => {
  fixture.tables.clear();
  vi.stubEnv(
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    JSON.stringify({
      project_id: "mealmate-d2e53",
      client_email: "synthetic@example.test",
      private_key: "synthetic-test-key",
    }),
  );
  vi.stubEnv("FIREBASE_STORAGE_BUCKET", "synthetic-storage-bucket");
});
afterEach(() => vi.unstubAllEnvs());

const recipe = { name: "Tomato toast", slug: "tomato-toast-test", created_by: "synthetic-user" };

describe("Firebase write results used by recipe generation", () => {
  it("returns the saved recipe record and slug after insert().select().single()", async () => {
    const result = await firebaseAdmin.from("recipes").insert(recipe).select("id,slug").single();
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ id: expect.any(String), slug: recipe.slug });
    expect(Array.isArray(result.data)).toBe(false);
    expect(fixture.table("recipes").get(result.data.id)?.slug).toBe(recipe.slug);
  });

  it("gives new recipes a persisted created_at so ordered recipe lists include them", async () => {
    await firebaseAdmin.from("recipes").insert(recipe);
    const saved = Array.from(fixture.table("recipes").values())[0];
    expect(typeof saved?.created_at).toBe("string");
    expect(Number.isFinite(Date.parse(String(saved?.created_at)))).toBe(true);
  });

  it("preserves an explicitly supplied recipe timestamp", async () => {
    const created_at = "2026-01-01T12:00:00.000Z";
    await firebaseAdmin.from("recipes").insert({ ...recipe, created_at });
    expect(Array.from(fixture.table("recipes").values())[0]?.created_at).toBe(created_at);
  });

  it("returns a single record for upsert().select().single()", async () => {
    const result = await firebaseAdmin
      .from("recipes")
      .upsert({ ...recipe, id: "existing-recipe" })
      .select("id,slug")
      .single();
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ id: "existing-recipe", slug: recipe.slug });
  });

  it("returns the updated record for update().select().single()", async () => {
    fixture.table("recipes").set("existing-recipe", { ...recipe, id: "existing-recipe" });
    const result = await firebaseAdmin
      .from("recipes")
      .update({ name: "Updated toast" })
      .eq("id", "existing-recipe")
      .select()
      .single();
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ id: "existing-recipe", name: "Updated toast" });
  });

  it("keeps selected bulk write results as arrays", async () => {
    const result = await firebaseAdmin
      .from("recipes")
      .insert([recipe, { ...recipe, slug: "another-toast" }])
      .select();
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2);
  });

  it("keeps unselected writes from returning data", async () => {
    const result = await firebaseAdmin.from("recipes").insert(recipe);
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });

  it("preserves strict single-read cardinality and optional empty reads", async () => {
    const required = await firebaseAdmin.from("recipes").select().single();
    expect(required.error?.message).toContain("Expected one recipes record");
    const optional = await firebaseAdmin.from("recipes").select().maybeSingle();
    expect(optional).toMatchObject({ data: null, error: null });
  });
});
