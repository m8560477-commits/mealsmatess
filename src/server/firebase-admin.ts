import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  getFirestore,
  Timestamp,
  type DocumentData,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";
import { getDownloadURL, getStorage } from "firebase-admin/storage";
import { getMessaging } from "firebase-admin/messaging";
import { randomBytes, randomUUID } from "node:crypto";

type Filter = { field: string; operator: string; value: unknown };
type DbResult<T = unknown> = { data: T; error: Error | null; count?: number | null };
type Row = Record<string, any> & { id: string };

let initialized:
  | {
      app: ReturnType<typeof initializeApp>;
      db: Firestore;
      auth: ReturnType<typeof getAuth>;
      bucket: ReturnType<ReturnType<typeof getStorage>["bucket"]>;
    }
  | undefined;

export function getFirebaseServerServices() {
  if (initialized) return initialized;
  const encoded = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  if (!encoded) {
    throw new Error(
      "Firebase Admin is not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON as a server-only encrypted Vercel environment variable.",
    );
  }

  let serviceAccount: { project_id?: string; client_email?: string; private_key?: string };
  try {
    serviceAccount = JSON.parse(encoded) as typeof serviceAccount;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.");
  }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error(
      "Firebase service-account JSON is missing project_id, client_email, or private_key.",
    );
  }

  const projectId =
    process.env["FIREBASE_PROJECT_ID"] ||
    process.env["VITE_FIREBASE_PROJECT_ID"] ||
    serviceAccount.project_id;
  if (projectId !== "mealmate-d2e53" || serviceAccount.project_id !== projectId) {
    throw new Error("Firebase Admin project must be mealmate-d2e53 and match the service account.");
  }

  const bucketName = (
    process.env["FIREBASE_STORAGE_BUCKET"] ||
    process.env["VITE_FIREBASE_STORAGE_BUCKET"] ||
    ""
  ).trim();
  if (!bucketName)
    throw new Error("FIREBASE_STORAGE_BUCKET or VITE_FIREBASE_STORAGE_BUCKET is required.");

  const existingApp = getApps().find((app) => app.name === "mealmate-admin");
  const app =
    existingApp ??
    initializeApp(
      {
        credential: cert({
          projectId,
          clientEmail: serviceAccount.client_email,
          privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"),
        }),
        projectId,
        storageBucket: bucketName,
      },
      "mealmate-admin",
    );
  initialized = {
    app,
    db: getFirestore(
      app,
      process.env["FIREBASE_FIRESTORE_DATABASE_ID"] ||
        process.env["VITE_FIREBASE_FIRESTORE_DATABASE_ID"] ||
        "default",
    ),
    auth: getAuth(app),
    bucket: getStorage(app).bucket(bucketName),
  };
  return initialized;
}

const USER_SUBCOLLECTIONS: Record<string, string> = {
  favorites: "favorites",
  grocery_items: "grocery",
  pantry_items: "pantry",
  meal_plans: "mealPlans",
  nutrition_logs: "nutritionLogs",
};

function collectionFor(db: Firestore, table: string) {
  const path = USER_SUBCOLLECTIONS[table];
  return path ? db.collectionGroup(path) : db.collection(table === "profiles" ? "users" : table);
}

function userCollectionFor(db: Firestore, table: string, userId: string) {
  const path = USER_SUBCOLLECTIONS[table];
  if (!path) return db.collection(collectionForName(table));
  return db.collection("users").doc(userId).collection(path);
}

function collectionForName(table: string) {
  return table === "profiles" ? "users" : table;
}

function documentForRow(
  db: Firestore,
  table: string,
  row: Record<string, unknown>,
  id: string,
  fallbackUserId?: string,
) {
  const subcollection = USER_SUBCOLLECTIONS[table];
  if (subcollection) {
    const ownerField = USER_OWNED_FIELDS[table] ?? "user_id";
    const userId = String(row[ownerField] ?? fallbackUserId ?? "");
    if (!userId) throw new Error(`A user_id is required to write ${table}.`);
    return db.collection("users").doc(userId).collection(subcollection).doc(id);
  }
  return db.collection(collectionForName(table)).doc(id);
}

function documentKey(table: string, row: Record<string, unknown>) {
  if (table === "profiles") return String(row["id"] ?? "");
  if (table === "app_settings" || table === "feature_flags") return String(row["key"] ?? "");
  if (table === "dish_searches") return String(row["name"] ?? "");
  if (table === "admin_allowlist") return String(row["email"] ?? "").toLowerCase();
  if ((table === "subscription_events" || table === "payments") && row["rc_event_id"])
    return String(row["rc_event_id"]);
  return String(row["id"] ?? randomUUID());
}

function comparable(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return value;
}

function matches(row: Row, filter: Filter): boolean {
  const left = comparable(row[filter.field]);
  const right = comparable(filter.value);
  switch (filter.operator) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "gt":
      return (left as any) > (right as any);
    case "gte":
      return (left as any) >= (right as any);
    case "lt":
      return (left as any) < (right as any);
    case "lte":
      return (left as any) <= (right as any);
    case "in":
      return Array.isArray(filter.value) && filter.value.includes(row[filter.field]);
    case "is":
      return filter.value === null ? row[filter.field] == null : row[filter.field] === filter.value;
    case "ilike":
    case "like": {
      const term = String(filter.value ?? "")
        .replaceAll("%", "")
        .toLowerCase();
      return String(row[filter.field] ?? "")
        .toLowerCase()
        .includes(term);
    }
    case "contains":
      return (
        Array.isArray(left) && Array.isArray(right) && right.every((value) => left.includes(value))
      );
    case "not.is":
      return filter.value === null ? row[filter.field] != null : row[filter.field] !== filter.value;
    default:
      return false;
  }
}

const USER_OWNED_FIELDS: Record<string, string> = {
  profiles: "id",
  favorites: "user_id",
  grocery_items: "user_id",
  pantry_items: "user_id",
  meal_plans: "user_id",
  nutrition_logs: "user_id",
  recipe_ratings: "user_id",
  recently_viewed: "user_id",
  follows: "follower_id",
  posts: "author_id",
  post_comments: "user_id",
  post_likes: "user_id",
  post_saves: "user_id",
  restaurant_orders: "customer_id",
};
const PUBLIC_READ_TABLES = new Set([
  "recipes",
  "restaurants",
  "restaurant_locations",
  "menu_items",
  "restaurant_promotions",
  "announcements",
  "ad_placements",
]);

class FirestoreTableQuery implements PromiseLike<DbResult<any>> {
  private filters: Filter[] = [];
  private sort: { field: string; ascending: boolean; nullsFirst?: boolean }[] = [];
  private maxRows: number | undefined;
  private rowRange: [number, number] | undefined;
  private action: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private values: Record<string, unknown> | Record<string, unknown>[] = {};
  private selected = false;
  private singleMode: "single" | "maybeSingle" | null = null;
  private countMode = false;
  private headMode = false;
  private conflictFields: string[] = [];

  constructor(
    private readonly table: string,
    private readonly userId?: string,
  ) {}

  private get scopedFilters(): Filter[] {
    if (!this.userId) return this.filters;
    const ownerField = USER_OWNED_FIELDS[this.table];
    if (ownerField)
      return [...this.filters, { field: ownerField, operator: "eq", value: this.userId }];
    if (this.table === "user_roles")
      return [...this.filters, { field: "user_id", operator: "eq", value: this.userId }];
    return this.filters;
  }

  private assertUserAccess(rows: Record<string, unknown>[]) {
    if (!this.userId) return;
    const ownerField = USER_OWNED_FIELDS[this.table];
    if (ownerField) {
      if (rows.some((row) => row[ownerField] !== this.userId)) {
        throw new Error(`Forbidden: ${this.table} records must belong to the signed-in user.`);
      }
      return;
    }
    if (this.action !== "select") throw new Error(`Forbidden: users cannot write ${this.table}.`);
    if (!PUBLIC_READ_TABLES.has(this.table) && this.table !== "user_roles") {
      throw new Error(`Forbidden: users cannot read ${this.table}.`);
    }
  }

  select(_columns = "*", options?: { count?: string; head?: boolean }) {
    this.selected = true;
    this.countMode = options?.count === "exact";
    this.headMode = options?.head === true;
    return this;
  }
  eq(field: string, value: unknown) {
    this.filters.push({ field, operator: "eq", value });
    return this;
  }
  neq(field: string, value: unknown) {
    this.filters.push({ field, operator: "neq", value });
    return this;
  }
  gt(field: string, value: unknown) {
    this.filters.push({ field, operator: "gt", value });
    return this;
  }
  gte(field: string, value: unknown) {
    this.filters.push({ field, operator: "gte", value });
    return this;
  }
  lt(field: string, value: unknown) {
    this.filters.push({ field, operator: "lt", value });
    return this;
  }
  lte(field: string, value: unknown) {
    this.filters.push({ field, operator: "lte", value });
    return this;
  }
  in(field: string, value: unknown[]) {
    this.filters.push({ field, operator: "in", value });
    return this;
  }
  is(field: string, value: unknown) {
    this.filters.push({ field, operator: "is", value });
    return this;
  }
  ilike(field: string, value: unknown) {
    this.filters.push({ field, operator: "ilike", value });
    return this;
  }
  like(field: string, value: unknown) {
    this.filters.push({ field, operator: "like", value });
    return this;
  }
  contains(field: string, value: unknown) {
    this.filters.push({ field, operator: "contains", value });
    return this;
  }
  not(field: string, operator: string, value: unknown) {
    this.filters.push({ field, operator: `not.${operator}`, value });
    return this;
  }
  match(values: Record<string, unknown>) {
    for (const [field, value] of Object.entries(values)) this.eq(field, value);
    return this;
  }
  order(field: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.sort.push({
      field,
      ascending: options?.ascending !== false,
      nullsFirst: options?.nullsFirst,
    });
    return this;
  }
  limit(rows: number) {
    this.maxRows = Math.max(0, rows);
    return this;
  }
  range(start: number, end: number) {
    this.rowRange = [Math.max(0, start), Math.max(start, end)];
    return this;
  }
  single() {
    this.singleMode = "single";
    return this.execute();
  }
  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this.execute();
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.action = "insert";
    this.values = values;
    return this;
  }
  update(values: Record<string, unknown>) {
    this.action = "update";
    this.values = values;
    return this;
  }
  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string },
  ) {
    this.action = "upsert";
    this.values = values;
    this.conflictFields = (options?.onConflict ?? "id").split(",").map((field) => field.trim());
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }

  then<TResult1 = DbResult<any>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<DbResult<any>> {
    try {
      const { db } = getFirebaseServerServices();
      const collectionRef = collectionFor(db, this.table);
      if (this.action === "insert") return await this.insertRows(db);
      if (this.action === "upsert") return await this.upsertRows(collectionRef);

      this.assertUserAccess([]);
      const snapshot = await collectionRef.get();
      let entries = snapshot.docs.map((item) => ({
        ref: item.ref,
        row: { id: item.id, ...item.data() } as Row,
      }));
      entries = entries.filter(({ row }) =>
        this.scopedFilters.every((filter) => matches(row, filter)),
      );
      if (this.userId && (this.action === "update" || this.action === "delete")) {
        this.assertUserAccess(entries.map(({ row }) => row));
      }
      for (const ordering of [...this.sort].reverse()) {
        entries.sort((a, b) => {
          const av = comparable(a.row[ordering.field]);
          const bv = comparable(b.row[ordering.field]);
          if (av == null || bv == null)
            return av == null
              ? ordering.nullsFirst === false
                ? 1
                : -1
              : ordering.nullsFirst === false
                ? -1
                : 1;
          const result = av < bv ? -1 : av > bv ? 1 : 0;
          return ordering.ascending ? result : -result;
        });
      }
      const count = entries.length;
      if (this.action === "delete" || this.action === "update") {
        if (this.filters.length === 0)
          throw new Error(`Refusing an unfiltered ${this.action} on ${this.table}.`);
        if (this.userId && this.action === "update") {
          const ownerField = USER_OWNED_FIELDS[this.table];
          const values = this.values as Record<string, unknown>;
          if (ownerField && values[ownerField] != null && values[ownerField] !== this.userId) {
            throw new Error("Forbidden: record ownership cannot be changed.");
          }
        }
        const batch = db.batch();
        for (const entry of entries) {
          if (this.action === "delete") batch.delete(entry.ref);
          else batch.set(entry.ref, this.values as DocumentData, { merge: true });
        }
        await batch.commit();
        const rows = entries.map(({ row }) =>
          this.action === "update" ? ({ ...row, ...this.values } as Row) : row,
        );
        return this.selected
          ? this.rowResult(rows, count)
          : { data: null, error: null, ...(this.countMode ? { count } : {}) };
      }

      if (this.rowRange) entries = entries.slice(this.rowRange[0], this.rowRange[1] + 1);
      if (this.maxRows != null) entries = entries.slice(0, this.maxRows);
      const rows = entries.map(({ row }) => row);
      return this.rowResult(rows, count);
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error(String(error)),
        count: null,
      };
    }
  }

  /** Apply the same row cardinality to reads and selected write results. */
  private rowResult(rows: Row[], count = rows.length): DbResult<any> {
    const counts = this.countMode ? { count } : {};
    if (this.singleMode === "single") {
      if (rows.length !== 1)
        throw new Error(`Expected one ${this.table} record, found ${rows.length}.`);
      return { data: rows[0], error: null, ...counts };
    }
    if (this.singleMode === "maybeSingle") {
      if (rows.length > 1)
        throw new Error(`Expected at most one ${this.table} record, found ${rows.length}.`);
      return { data: rows[0] ?? null, error: null, ...counts };
    }
    return { data: this.headMode ? null : rows, error: null, ...counts };
  }

  private async insertRows(db: Firestore): Promise<DbResult<any>> {
    const inputRows = (Array.isArray(this.values) ? this.values : [this.values]) as Record<
      string,
      unknown
    >[];
    this.assertUserAccess(inputRows);
    const batch = db.batch();
    const rows = inputRows.map((input) => {
      const id = documentKey(this.table, input);
      if (!id) throw new Error(`A document key is required to write ${this.table}.`);
      const value: Record<string, unknown> = { ...input, id };
      if (this.table === "recipes" || USER_SUBCOLLECTIONS[this.table]) {
        value["created_at"] ??= new Date().toISOString();
        if (this.table === "grocery_items") value["checked"] ??= false;
      }
      const ref = documentForRow(db, this.table, value, id, this.userId);
      batch.create(ref, value);
      return value as Row;
    });
    await batch.commit();
    return this.selected ? this.rowResult(rows) : { data: null, error: null };
  }

  private async upsertRows(collectionRef: Query<DocumentData>): Promise<DbResult<any>> {
    const { db } = getFirebaseServerServices();
    const inputRows = (Array.isArray(this.values) ? this.values : [this.values]) as Record<
      string,
      unknown
    >[];
    this.assertUserAccess(inputRows);
    const results: Row[] = [];
    for (const input of inputRows) {
      const query = collectionRef.where(
        this.conflictFields[0] ?? "id",
        "==",
        input[this.conflictFields[0] ?? "id"],
      );
      const snapshot = await query.get();
      const existing = snapshot.docs.find((item) =>
        this.conflictFields.every((field) => item.get(field) === input[field]),
      );
      const id = existing?.id ?? documentKey(this.table, input);
      const ref = existing?.ref ?? documentForRow(db, this.table, input, id, this.userId);
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(ref);
        transaction.set(ref, { ...(current.data() ?? {}), ...input, id }, { merge: true });
      });
      results.push({ ...(existing?.data() ?? {}), ...input, id } as Row);
    }
    return this.selected ? this.rowResult(results) : { data: null, error: null };
  }
}

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function startOfUtcMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

async function premiumActive(userId: string) {
  const { resolveEntitlement } = await import("@/lib/entitlements.server");
  return (await resolveEntitlement(userId)).isPremium;
}

async function runRpc(name: string, args: Record<string, unknown>): Promise<DbResult<any>> {
  const { db } = getFirebaseServerServices();
  switch (name) {
    case "check_rate_limit": {
      const bucket = String(args["_bucket"] ?? "default");
      const identifier = String(args["_identifier"] ?? "");
      const max = Math.max(1, Number(args["_max_per_minute"] ?? 1));
      if (!identifier) return { data: true, error: null };
      const id = `${bucket}:${identifier}`.replaceAll("/", "_");
      const ref = db.collection("rate_limits").doc(id);
      const allowed = await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        const now = Date.now();
        const record = snap.data();
        const start = Number(record?.window_start ?? 0);
        const count = start > now - 60_000 ? Number(record?.count ?? 0) : 0;
        if (count >= max) return false;
        transaction.set(ref, {
          bucket,
          identifier,
          window_start: start > now - 60_000 ? start : now,
          count: count + 1,
          expires_at: new Date(now + 120_000).toISOString(),
        });
        return true;
      });
      return { data: allowed, error: null };
    }
    case "consume_ai_credit":
    case "consume_image_credit": {
      const userId = String(args["_user_id"] ?? "");
      if (!userId)
        return {
          data: { allowed: false, reason: "daily", resets_at: startOfUtcDay().toISOString() },
          error: null,
        };
      if (await premiumActive(userId))
        return { data: { allowed: true, premium: true }, error: null };
      return {
        data: { allowed: false, reason: "subscription_required", premium: false },
        error: null,
      };
    }
    case "increment_dish_search": {
      const dish = String(args["_name"] ?? "")
        .trim()
        .toLowerCase();
      if (!dish) return { data: 0, error: null };
      const ref = db.collection("dish_searches").doc(dish);
      const count = await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        const next = Number(snap.data()?.count ?? 0) + 1;
        transaction.set(
          ref,
          { name: dish, count: next, updated_at: new Date().toISOString() },
          { merge: true },
        );
        return next;
      });
      return { data: count, error: null };
    }
    case "is_premium":
      return { data: await premiumActive(String(args["_user_id"] ?? "")), error: null };
    case "setting_int": {
      const { data } = await firebaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", String(args["_key"] ?? ""))
        .maybeSingle();
      return { data: Number(data?.value ?? args["_default"] ?? 0), error: null };
    }
    case "recalc_recipe_rating": {
      const recipeId = String(args["_recipe_id"] ?? "");
      const { data: ratings } = await firebaseAdmin
        .from("recipe_ratings")
        .select("rating")
        .eq("recipe_id", recipeId);
      const values = (ratings ?? []).map((row: Row) => Number(row.rating)).filter(Number.isFinite);
      const average = values.length
        ? values.reduce((sum: number, value: number) => sum + value, 0) / values.length
        : 0;
      await firebaseAdmin
        .from("recipes")
        .update({ rating: average, rating_count: values.length })
        .eq("id", recipeId);
      return { data: null, error: null };
    }
    case "my_ai_usage": {
      const userId = String(args["_user_id"] ?? "");
      const dayKey = startOfUtcDay().toISOString().slice(0, 10);
      const monthKey = startOfUtcMonth().toISOString().slice(0, 7);
      const { data: daily } = await firebaseAdmin
        .from("usage_limits")
        .select("count")
        .eq("user_id", userId)
        .eq("feature_key", "ai_chat")
        .eq("period_key", dayKey)
        .maybeSingle();
      const { data: monthly } = await firebaseAdmin
        .from("usage_limits")
        .select("count")
        .eq("user_id", userId)
        .eq("feature_key", "ai_month")
        .eq("period_key", monthKey)
        .maybeSingle();
      const { count: favoritesCount } = await firebaseAdmin
        .from("favorites")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      const { count: plansCount } = await firebaseAdmin
        .from("meal_plans")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      return {
        data: {
          day_used: Number(daily?.count ?? 0),
          day_max: 10,
          month_used: Number(monthly?.count ?? 0),
          month_max: null,
          favorites_used: favoritesCount ?? 0,
          favorites_max: null,
          plans_used: plansCount ?? 0,
          plans_max: null,
          day_resets_at: new Date(startOfUtcDay().getTime() + 86_400_000).toISOString(),
          month_resets_at: new Date(
            Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1),
          ).toISOString(),
        },
        error: null,
      };
    }
    default:
      return { data: null, error: new Error(`Unsupported Firebase operation: ${name}`) };
  }
}

export function getFirebaseAdminFirestore() {
  return getFirebaseServerServices().db;
}

export function getFirebaseAdminMessaging() {
  return getMessaging(getFirebaseServerServices().app);
}

export function firebaseUserDb(userId: string) {
  return {
    from(table: string) {
      return new FirestoreTableQuery(table, userId);
    },
    async rpc(name: string, args: Record<string, unknown> = {}) {
      return runRpc(name, { ...args, _user_id: args["_user_id"] ?? userId });
    },
  };
}

export const firebaseAdmin = {
  from(table: string) {
    return new FirestoreTableQuery(table);
  },
  async rpc(name: string, args: Record<string, unknown> = {}) {
    return runRpc(name, args);
  },
  storage: {
    from(bucketName: string) {
      return {
        async upload(
          path: string,
          body: Uint8Array | Buffer | string,
          options?: { contentType?: string; upsert?: boolean },
        ) {
          try {
            const { bucket } = getFirebaseServerServices();
            const file = bucket.file(`${bucketName}/${path}`);
            await file.save(body, {
              resumable: false,
              metadata: { contentType: options?.contentType },
              preconditionOpts: options?.upsert ? undefined : { ifGenerationMatch: 0 },
            });
            return { data: { path }, error: null };
          } catch (error) {
            return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
          }
        },
        // Token URLs persist with the object and avoid expiring cached recipe photos.
        async createDownloadUrl(path: string) {
          try {
            const { bucket } = getFirebaseServerServices();
            const file = bucket.file(`${bucketName}/${path}`);
            await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: randomUUID() } });
            return { data: { downloadUrl: await getDownloadURL(file) }, error: null };
          } catch (error) {
            return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
          }
        },
        async createSignedUrl(path: string, expiresInSeconds: number) {
          try {
            const { bucket } = getFirebaseServerServices();
            const expires = Date.now() + expiresInSeconds * 1000;
            const [signedUrl] = await bucket
              .file(`${bucketName}/${path}`)
              .getSignedUrl({ action: "read", expires });
            return { data: { signedUrl }, error: null };
          } catch (error) {
            return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
          }
        },
        async remove(paths: string[]) {
          try {
            const { bucket } = getFirebaseServerServices();
            await Promise.all(paths.map((path) => bucket.file(`${bucketName}/${path}`).delete()));
            return { data: paths, error: null };
          } catch (error) {
            return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
          }
        },
      };
    },
  },
};

export async function getOrCreateFirebaseUser(email: string, displayName: string) {
  const { auth } = getFirebaseServerServices();
  let existingUser: Awaited<ReturnType<typeof auth.getUserByEmail>> | undefined;
  try {
    existingUser = await auth.getUserByEmail(email);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code !== "auth/user-not-found") throw error;
  }

  if (existingUser) return { user: existingUser, created: false };
  const user = await auth.createUser({
    email,
    displayName,
    password: randomBytes(48).toString("base64url"),
  });
  return { user, created: true };
}

export async function verifyFirebaseIdToken(token: string) {
  return getFirebaseServerServices().auth.verifyIdToken(token, true);
}

export async function firebaseAuthUserExists(uid: string) {
  try {
    await getFirebaseServerServices().auth.getUser(uid);
    return true;
  } catch {
    return false;
  }
}

export { Timestamp };
