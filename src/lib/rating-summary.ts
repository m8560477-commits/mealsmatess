import { getRecipeRatingSummaries } from "@/lib/engagement.functions";
export type RatingSummary = { average: number; count: number } | null;
type Pending = { resolve: (value: RatingSummary) => void; reject: (error: unknown) => void };
const pending = new Map<string, Pending[]>();
let scheduled = false;
/** Coalesce all newly visible card ratings into one authenticated server call. */
export function loadRatingSummary(id: string): Promise<RatingSummary> {
  return new Promise((resolve, reject) => {
    const callbacks = pending.get(id) ?? [];
    callbacks.push({ resolve, reject });
    pending.set(id, callbacks);
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      const entries = [...pending];
      pending.clear();
      scheduled = false;
      for (let index = 0; index < entries.length; index += 30) {
        const group = entries.slice(index, index + 30);
        void getRecipeRatingSummaries({ data: { recipeIds: group.map(([id]) => id) } })
          .then((summaries) =>
            group.forEach(([id, callbacks]) =>
              callbacks.forEach(({ resolve }) => resolve(summaries[id] ?? null)),
            ),
          )
          .catch((error) =>
            group.forEach(([, callbacks]) => callbacks.forEach(({ reject }) => reject(error))),
          );
      }
    });
  });
}
