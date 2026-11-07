import { afterEach, expect, it, vi } from "vitest";
import { cachedCatalogPage, invalidateRecipeCatalogCache } from "@/lib/recipe-catalog-cache.server";
afterEach(() => {
  invalidateRecipeCatalogCache();
  vi.useRealTimers();
});
it("shares in-flight reads, expires stale data, and never caches a failed read", async () => {
  vi.useFakeTimers();
  let finish!: (value: string[]) => void;
  const load = vi.fn(
    () =>
      new Promise<string[]>((resolve) => {
        finish = resolve;
      }),
  );
  const a = cachedCatalogPage("page", load);
  const b = cachedCatalogPage("page", load);
  expect(load).toHaveBeenCalledOnce();
  finish(["stored-recipe"]);
  expect(await a).toEqual(await b);
  expect(await cachedCatalogPage("page", load)).toEqual(["stored-recipe"]);
  vi.advanceTimersByTime(30_001);
  const failure = vi.fn(async () => {
    throw new Error("offline");
  });
  await expect(cachedCatalogPage("page", failure)).rejects.toThrow("offline");
  expect(await cachedCatalogPage("page", async () => ["fresh-recipe"])).toEqual(["fresh-recipe"]);
});
it("invalidates cached catalog pages after writes", async () => {
  await cachedCatalogPage("page", async () => ["old"]);
  invalidateRecipeCatalogCache();
  expect(await cachedCatalogPage("page", async () => ["new"])).toEqual(["new"]);
});
