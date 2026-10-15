<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Recipe photos come from src/lib/recipe-images.server.ts (official image APIs + AI relevance check), stored on the recipe row and cached; never pick unverified images client-side. Why: accuracy and API cost control.

- Pantry management lives on /pantry and shares myPantryQuery with generation controls; this keeps ingredient edits and cooking prompts consistent.
- Reuse CookingInput for home and AI chef, with visualViewport shell metrics for keyboard clearance; this prevents duplicated camera/pantry navigation and covered inputs.
- Keep branding logo separate from ChefMascot artwork; this preserves the user logo while making the assistant recognizable.

- RecipeImage renders stored/curated media only; explicit search events call authenticated ensureRecipeImage and bulk backfill stays disabled, preventing browse-driven image costs.
- The shared bottom navigation always has exactly Home, Dining, AI Chef, Planner, and Profile; Pantry remains accessible through AI Chef.
- Keep typography and admin/onboarding presentation tokens in the global stylesheet; expand the shared shell only for the admin workspace so analytics have room without changing consumer layouts.
