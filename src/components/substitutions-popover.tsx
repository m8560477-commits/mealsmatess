import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { suggestSubstitutions } from "@/lib/planner.functions";

type Sub = { name: string; ratio?: string; notes?: string };

export function SubstitutionsButton({ ingredient, recipeName }: { ingredient: string; recipeName?: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const run = useServerFn(suggestSubstitutions);

  async function load() {
    setOpen(true);
    if (subs || loading) return;
    setLoading(true);
    try {
      const { substitutes } = await run({ data: { ingredient, context: recipeName } });
      setSubs(substitutes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't fetch substitutes");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={load}
        aria-label={`Substitutes for ${ingredient}`}
        className="text-muted-foreground transition-colors hover:text-primary"
      >
        <Sparkles className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Ingredient substitutions"
            className="w-full max-w-md rounded-3xl bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Substitutes</p>
                <h3 className="font-display text-xl">{ingredient}</h3>
              </div>
              <button aria-label="Close" onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            {loading && (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Asking the chef…
              </div>
            )}
            {!loading && subs && subs.length === 0 && (
              <p className="py-6 text-sm text-muted-foreground">No good substitutes found.</p>
            )}
            {!loading && subs && subs.length > 0 && (
              <ul className="space-y-3">
                {subs.map((s, i) => (
                  <li key={i} className="rounded-2xl border border-border p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-semibold">{s.name}</p>
                      {s.ratio && <span className="text-xs text-muted-foreground">{s.ratio}</span>}
                    </div>
                    {s.notes && <p className="mt-1 text-sm text-muted-foreground">{s.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
