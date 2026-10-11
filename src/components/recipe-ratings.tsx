import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";

type Rating = {
  id: string;
  user_id: string;
  rating: number;
  review: string | null;
  created_at: string;
};

export function RecipeRatings({ recipeId }: { recipeId: string }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const [myRating, setMyRating] = useState(0);
  const [review, setReview] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: ratings } = useQuery({
    queryKey: ["ratings", recipeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe_ratings")
        .select("id,user_id,rating,review,created_at")
        .eq("recipe_id", recipeId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Rating[];
    },
  });

  const mine = user ? ratings?.find((r) => r.user_id === user.id) : undefined;
  useEffect(() => {
    if (mine) {
      setMyRating(mine.rating);
      setReview(mine.review ?? "");
    }
  }, [mine]);

  async function submit() {
    if (!user) {
      toast.info("Sign in to rate");
      return;
    }
    if (!myRating) {
      toast.info("Pick 1–5 stars");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("recipe_ratings")
        .upsert(
          { user_id: user.id, recipe_id: recipeId, rating: myRating, review: review.trim() || null },
          { onConflict: "user_id,recipe_id" },
        );
      if (error) throw error;
      toast.success("Thanks for rating!");
      await qc.invalidateQueries({ queryKey: ["ratings", recipeId] });
      await qc.invalidateQueries({ queryKey: ["recipe"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save rating");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl">Ratings & reviews</h2>

      <div className="mt-4 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-medium">Your rating</p>
        <div className="mt-2 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setMyRating(n)}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              className="p-0.5"
            >
              <Star
                className={`h-6 w-6 ${n <= myRating ? "fill-primary text-primary" : "text-muted-foreground"}`}
              />
            </button>
          ))}
        </div>
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder="Share your thoughts (optional)"
          rows={3}
          maxLength={800}
          className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={submit} disabled={saving || !user}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mine ? "Update review" : "Post review"}
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {ratings && ratings.length > 0 ? (
          ratings.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border/60 bg-card/50 p-4">
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-3.5 w-3.5 ${i < r.rating ? "fill-primary text-primary" : "text-muted-foreground/40"}`}
                  />
                ))}
                <span className="ml-2 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              {r.review && <p className="mt-2 text-sm">{r.review}</p>}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No reviews yet. Be the first!</p>
        )}
      </div>
    </section>
  );
}
