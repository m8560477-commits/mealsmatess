// Synthetic in-memory boundary fixture, never imported by application code.
export function firestoreFixture() {
  const records = new Map<string, Record<string, any>>();
  class Ref {
    constructor(public path: string) {}
    get id() {
      return this.path.split("/").at(-1)!;
    }
    get parent(): Query {
      return new Query(this.path.split("/").slice(0, -1).join("/"));
    }
    collection(name: string) {
      return new Query(`${this.path}/${name}`);
    }
    async get() {
      const data = records.get(this.path);
      return {
        id: this.id,
        ref: this,
        exists: !!data,
        data: () => data,
        get: (key: string) => key.split(".").reduce((v, k) => v?.[k], data as any),
      };
    }
    async set(data: Record<string, any>, options?: { merge?: boolean }) {
      records.set(this.path, { ...(options?.merge ? records.get(this.path) : {}), ...data });
    }
    async update(data: Record<string, any>) {
      if (!records.has(this.path)) throw new Error("Missing record");
      return this.set(data, { merge: true });
    }
    async create(data: Record<string, any>) {
      if (records.has(this.path)) throw new Error("Duplicate");
      return this.set(data);
    }
    async delete() {
      records.delete(this.path);
    }
  }
  class Query {
    filters: Array<[string, string, any]> = [];
    max = Infinity;
    constructor(public path: string) {}
    get parent(): Ref | null {
      const bits = this.path.split("/");
      return bits.length > 1 ? new Ref(bits.slice(0, -1).join("/")) : null;
    }
    doc(id: string) {
      return new Ref(`${this.path}/${id}`);
    }
    where(key: string, op: string, value: any) {
      this.filters.push([key, op, value]);
      return this;
    }
    limit(max: number) {
      this.max = max;
      return this;
    }
    orderBy() {
      return this;
    }
    startAfter() {
      return this;
    }
    async get() {
      const docs = await Promise.all(
        [...records.keys()]
          .filter(
            (path) =>
              path.startsWith(`${this.path}/`) &&
              path.split("/").length === this.path.split("/").length + 1,
          )
          .map((path) => new Ref(path).get()),
      );
      const filtered = docs
        .filter((doc) =>
          this.filters.every(([key, op, val]) =>
            op === "=="
              ? doc.get(key) === val
              : op === ">="
                ? doc.get(key) >= val
                : doc.get(key) <= val,
          ),
        )
        .slice(0, this.max);
      return { docs: filtered, size: filtered.length, empty: !filtered.length };
    }
  }
  const write = {
    get: (ref: Ref | Query) => ref.get(),
    set: (ref: Ref, value: Record<string, any>, options?: { merge?: boolean }) => {
      void ref.set(value, options);
    },
    update: (ref: Ref, value: Record<string, any>) => {
      void ref.update(value);
    },
    create: (ref: Ref, value: Record<string, any>) => {
      void ref.create(value);
    },
    delete: (ref: Ref) => {
      void ref.delete();
    },
    commit: async () => {},
  };
  let lock: Promise<unknown> = Promise.resolve();
  const db = {
    collection: (path: string) => new Query(path),
    getAll: (...refs: Ref[]) => Promise.all(refs.map((ref) => ref.get())),
    batch: () => write,
    runTransaction: <T>(fn: (tx: typeof write) => Promise<T>) => {
      const result = lock.then(() => fn(write));
      lock = result.catch(() => undefined);
      return result;
    },
  };
  return { db, records };
}
