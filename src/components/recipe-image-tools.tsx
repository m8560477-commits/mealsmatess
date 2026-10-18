import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { firebaseData } from "@/lib/firebase-data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { chooseRecipeImage, getImageAlternatives } from "@/lib/recipe-images.functions";

type Attribution = {
  photographer?: string | null;
  photographerUrl?: string | null;
  pageUrl?: string | null;
} | null;

/** Small credit line required by Unsplash/Pexels licensing. */
export function ImageCredit({
  source,
  attribution,
}: {
  source?: string | null;
  attribution?: unknown;
}) {
  const a = attribution as Attribution;
  if (!source || !a?.photographer) return null;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      Photo by{" "}
      {a.photographerUrl ? (
        <a href={a.photographerUrl} target="_blank" rel="noopener noreferrer" className="underline">
          {a.photographer}
        </a>
      ) : (
        a.photographer
      )}{" "}
      on{" "}
      {a.pageUrl ? (
        <a href={a.pageUrl} target="_blank" rel="noopener noreferrer" className="underline">
          {source}
        </a>
      ) : (
        source
      )}
    </p>
  );
}

function useIsAdmin(userId: string | undefined) {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!userId) return setIsAdmin(false);
    void firebaseData
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [userId]);
  return isAdmin;
}

type Option = Awaited<ReturnType<typeof getImageAlternatives>>["options"][number];

/** Quiet "Change image" link for the recipe owner or an admin. */
export function ChangeImageButton({
  recipe,
  userId,
}: {
  recipe: { id: string; slug: string; created_by?: string | null };
  userId?: string | undefined;
}) {
  const isAdmin = useIsAdmin(userId);
  const canEdit = !!userId && (isAdmin || recipe.created_by === userId);
  const fetchAlternatives = useServerFn(getImageAlternatives);
  const choose = useServerFn(chooseRecipeImage);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  if (!canEdit) return null;

  async function openPicker() {
    setOpen(true);
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetchAlternatives({ data: { recipeId: recipe.id } });
      setOptions(res.options);
      if (res.reason === "no_provider") setMessage("No photo service is connected yet.");
      else if (res.options.length === 0) setMessage("No matching photos found for this dish.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't load photos.");
    } finally {
      setLoading(false);
    }
  }

  async function pick(o: Option) {
    setSaving(o.id);
    try {
      await choose({ data: { recipeId: recipe.id, provider: o.provider, id: o.id } });
      await queryClient.invalidateQueries({ queryKey: ["recipe", recipe.slug] });
      toast.success("Recipe photo updated");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that photo");
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-1 h-7 px-2 text-xs text-muted-foreground"
        onClick={openPicker}
      >
        <ImageIcon className="mr-1 h-3.5 w-3.5" /> Change image
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose a photo</DialogTitle>
            <DialogDescription>Best matches for this dish, ranked by accuracy.</DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Finding matching photos…
            </div>
          ) : message ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{message}</p>
          ) : (
            <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
              {options.map((o) => (
                <button
                  key={`${o.provider}-${o.id}`}
                  type="button"
                  disabled={!!saving}
                  onClick={() => pick(o)}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-muted text-left focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <img
                    src={o.thumb}
                    alt={o.title || "Food photo"}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                  <span className="absolute bottom-1 left-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium">
                    {o.score}% · {o.provider}
                  </span>
                  {saving === o.id && (
                    <span className="absolute inset-0 grid place-items-center bg-background/60">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Bulk image work disabled: image discovery happens only on a user search. */
export function RecipeImageBackfillCard() {
  return null;
}
