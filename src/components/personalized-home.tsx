import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useSession } from "@/hooks/use-session";
import { getOnboardingExperience } from "@/lib/onboarding.functions";
import { RecipeImage } from "@/components/recipe-image";
export function PersonalizedHome() {
  const { user } = useSession();
  const { data } = useQuery({
    queryKey: ["onboarding-experience", user?.id],
    queryFn: () => getOnboardingExperience(),
    enabled: !!user,
  });
  if (!data) return null;
  return (
    <section className="space-y-4 px-5 py-5">
      <h2 className="font-display text-xl">Your MealMate picks</h2>
      <p>{data.greeting}</p>
      <div className="flex flex-wrap gap-2">
        {data.categories.map((category) => (
          <Link
            className="rounded-full border px-3 py-2 text-sm"
            key={category}
            to="/recipes"
            search={{ q: category }}
          >
            {category}
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {data.recipes.map((recipe) => (
          <Link to="/recipe/$slug" params={{ slug: recipe.slug }} key={recipe.id}>
            <RecipeImage recipe={recipe} className="aspect-square w-full rounded-xl object-cover" />
            <h3 className="mt-2 text-sm font-semibold">{recipe.name}</h3>
          </Link>
        ))}
      </div>
      <div className="space-y-2">
        {data.prompts.map((prompt) => (
          <Link
            className="block rounded-xl border p-3 text-sm"
            to="/chat"
            search={{ q: prompt }}
            key={prompt}
          >
            {prompt}
          </Link>
        ))}
      </div>
      <Link className="text-sm underline" to="/onboarding">
        Edit your preferences
      </Link>
    </section>
  );
}
