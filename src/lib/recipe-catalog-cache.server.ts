/** Only public recipe data; callers must still pass the premium middleware. */
const pages = new Map<string, { until: number; value: Promise<unknown> }>();
export function cachedCatalogPage<T>(key: string, load: () => Promise<T>): Promise<T> {
  const cached = pages.get(key);
  if (cached && cached.until > Date.now()) return cached.value as Promise<T>;
  if (pages.size >= 64) pages.delete(pages.keys().next().value!);
  const entry = { until: Date.now() + 30_000, value: load() };
  pages.set(key, entry);
  entry.value.catch(() => {
    if (pages.get(key) === entry) pages.delete(key);
  });
  return entry.value;
}
export function invalidateRecipeCatalogCache() {
  pages.clear();
}
