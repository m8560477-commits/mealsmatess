import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, Check, Loader2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasNutrition, type ScanProgress, type ScanResult } from "@/lib/scanner";
import { saveScanResult } from "@/lib/scanner-save";
import { ScannerAnalysis } from "@/components/scanner-analysis";

function today() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export function ScannerResults({
  result,
  progress,
  onReset,
}: {
  result: ScanResult;
  progress: ScanProgress;
  onReset: () => void;
}) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [date, setDate] = useState(today);
  const [mealType, setMealType] = useState("Lunch");
  const [logNutrition, setLogNutrition] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pantry = result.mode === "ingredients";
  async function save() {
    if (saving || saved) return;
    setSaving(true);
    setError(null);
    try {
      await saveScanResult(result, {
        destination: pantry ? "pantry" : "planner",
        date,
        mealType,
        logNutrition,
      });
      setSaved(true);
      void client.invalidateQueries({ queryKey: [pantry ? "pantry" : "planner"] });
      void client.invalidateQueries({ queryKey: ["nutrition"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save this scan. Please retry.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-4">
      <section className="scanner-panel space-y-4 p-5" aria-label="Scan results">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-200">
            {result.source === "ai"
              ? "AI recognition · not independently verified"
              : "Open Food Facts · database record"}
          </p>
          <h2 className="mt-2 break-words font-display text-2xl">{result.name}</h2>
          {result.description && (
            <p className="mt-2 text-sm text-slate-300">{result.description}</p>
          )}
          {result.confidence !== null && (
            <p className="mt-2 text-xs text-slate-400">
              Model-reported confidence: {Math.round(result.confidence * 100)}% · not a guarantee of
              accuracy
            </p>
          )}
          {result.barcode && (
            <p className="mt-2 text-xs text-slate-400">Product code: {result.barcode}</p>
          )}
        </div>
        <div>
          <h3 className="font-semibold">
            Nutrition {result.source === "ai" ? "estimates" : "from database"}
          </h3>
          {hasNutrition(result.nutrition) ? (
            <>
              <p className="mt-1 text-xs text-slate-300">{result.nutrition!.basis}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(
                  [
                    ["Energy", result.nutrition!.calories, "kcal"],
                    ["Protein", result.nutrition!.protein_g, "g"],
                    ["Carbs", result.nutrition!.carbs_g, "g"],
                    ["Fat", result.nutrition!.fat_g, "g"],
                    ["Fibre", result.nutrition!.fiber_g, "g"],
                  ] as const
                ).map(([label, value, unit]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <dt className="text-xs text-slate-400">{label}</dt>
                    <dd className="mt-1 text-lg font-semibold">
                      {value === null ? (
                        <span className="text-sm font-normal text-slate-400">Unavailable</span>
                      ) : (
                        <>
                          {value} <span className="text-xs font-normal">{unit}</span>
                        </>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-400">
              Nutrition could not be established for this scan.
            </p>
          )}
        </div>
        <div>
          <h3 className="font-semibold">Ingredients</h3>
          <p className="mt-1 text-xs text-slate-400">
            {result.ingredient_source === "database"
              ? "Recorded in Open Food Facts; confirm on the package."
              : result.ingredient_source === "ai_transcription"
                ? "AI transcription; compare with the original text."
                : result.ingredient_source === "ai_observation"
                  ? "Visible ingredients suggested by AI; hidden ingredients cannot be established."
                  : "Ingredient information is unavailable."}
          </p>
          {result.ingredients_text && (
            <p className="mt-2 break-words text-sm text-slate-300">{result.ingredients_text}</p>
          )}
          {!!result.ingredients.length && (
            <ul className="mt-2 space-y-1 text-sm">
              {result.ingredients.map((item, index) => (
                <li key={index}>
                  {item.name}
                  {item.quantity ? ` — ${item.quantity}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="font-semibold">Allergens & traces</h3>
          <p className="mt-1 text-sm text-slate-300">
            {result.allergens.length
              ? result.allergens.join(", ")
              : "Allergens could not be established. This does not mean allergen-free."}
          </p>
          {!!result.traces.length && (
            <p className="mt-1 text-sm text-slate-300">
              Recorded possible traces: {result.traces.join(", ")}
            </p>
          )}
          {result.allergen_source !== "unknown" && (
            <p className="mt-1 text-xs text-slate-400">
              {result.allergen_source === "database"
                ? "Database label information"
                : "AI-read label statement"}{" "}
              · always check the current package.
            </p>
          )}
        </div>
        {result.recipe && (
          <div>
            <h3 className="font-semibold">Recipe transcription</h3>
            <p className="mt-1 text-xs text-slate-400">
              {result.recipe.servings
                ? `${result.recipe.servings} servings reported. `
                : "Serving count not available. "}
              Check these steps against the original recipe.
            </p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-200">
              {result.recipe.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        )}
        <aside className="rounded-2xl border border-amber-200/20 p-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-100">
            <AlertCircle className="size-4" />
            What could not be verified
          </h3>
          <ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-relaxed text-slate-300">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </aside>
        <details>
          <summary className="cursor-pointer text-sm text-blue-200">Checks performed</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-300">
            {result.checks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        </details>
      </section>
      <section className="scanner-panel p-4" aria-label="Save scan">
        <h3 className="flex items-center gap-2 font-semibold">
          <CalendarDays className="size-4" />
          {pantry ? "Add ingredients to pantry" : "Add to meal plan"}
        </h3>
        {!pantry && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-300">
              Date
              <input
                className="scanner-field mt-1 w-full"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={saving || saved}
              />
            </label>
            <label className="text-xs text-slate-300">
              Meal
              <select
                className="scanner-field mt-1 w-full"
                value={mealType}
                onChange={(e) => setMealType(e.target.value)}
                disabled={saving || saved}
              >
                {["Breakfast", "Lunch", "Dinner", "Snack"].map((meal) => (
                  <option key={meal}>{meal}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        {result.mode === "dish" && result.source === "ai" && hasNutrition(result.nutrition) && (
          <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-300">
            <input
              type="checkbox"
              checked={logNutrition}
              onChange={(e) => setLogNutrition(e.target.checked)}
              disabled={saving || saved}
              className="mt-0.5"
            />
            <span>
              Also log these AI nutrition estimates for one displayed portion:{" "}
              {result.nutrition!.basis}
            </span>
          </label>
        )}
        {result.mode === "recipe" && (
          <p className="mt-3 text-xs text-slate-400">
            Adds the recipe name to your meal plan. The transcription is not published to the recipe
            catalog.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-amber-200">
            {error}
          </p>
        )}
        {saved ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p role="status" className="flex items-center gap-2 text-sm text-blue-200">
              <Check className="size-4" />
              Saved
            </p>
            <Button onClick={() => void navigate({ to: pantry ? "/pantry" : "/planner" })}>
              Open {pantry ? "pantry" : "planner"}
            </Button>
          </div>
        ) : (
          <Button className="mt-4 w-full" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {saving
              ? "Saving…"
              : error
                ? "Retry save"
                : pantry
                  ? `Add ${result.ingredients.length} ingredients`
                  : "Add to meal plan"}
          </Button>
        )}
        <Button variant="outline" className="mt-3 w-full" onClick={onReset} disabled={saving}>
          <ScanLine />
          Scan again
        </Button>
      </section>
      <details className="scanner-panel p-4">
        <summary className="cursor-pointer text-sm text-slate-300">Analysis history</summary>
        <div className="mt-4">
          <ScannerAnalysis progress={progress} />
        </div>
      </details>
    </div>
  );
}
