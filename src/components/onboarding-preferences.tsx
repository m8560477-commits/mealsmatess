import type { FoodPreferences } from "@/lib/preferences";

export function PreferenceChoices({
  preferences,
  onChange,
  disabled,
}: {
  preferences: FoodPreferences;
  onChange: (p: FoodPreferences) => void;
  disabled: boolean;
}) {
  function toggle(field: "favorite_foods" | "dietary_restrictions" | "allergies", option: string) {
    const current = preferences[field];
    onChange({
      ...preferences,
      [field]: current.includes(option)
        ? current.filter((v) => v !== option)
        : [...current, option],
    });
  }
  return (
    <div className="onboarding-preferences">
      {(
        [
          [
            "favorite_foods",
            "Foods you love",
            ["Pasta", "Vegetables", "Chicken", "Seafood", "Rice", "Baking"],
          ],
          [
            "dietary_restrictions",
            "Dietary preferences",
            ["Vegetarian", "Vegan", "Halal", "Gluten-free", "Dairy-free", "High-protein"],
          ],
          [
            "allergies",
            "Food allergies",
            ["Peanuts", "Tree nuts", "Milk", "Eggs", "Wheat", "Soy", "Fish", "Shellfish", "Sesame"],
          ],
        ] as const
      ).map(([field, label, options]) => (
        <fieldset disabled={disabled} key={field}>
          <legend>{label}</legend>
          {field === "allergies" && (
            <p>Separate from preferences. Always check ingredients and food labels.</p>
          )}
          <div className="onboarding-chips">
            {Array.from(new Set([...options, ...preferences[field]])).map((option) => (
              <button
                type="button"
                key={option}
                aria-pressed={preferences[field].includes(option)}
                onClick={() => toggle(field, option)}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset disabled={disabled}>
        <legend>Your goal</legend>
        <div className="onboarding-chips">
          {["Eat healthier", "Save money", "Discover new recipes", "Plan meals for the week"].map(
            (goal) => (
              <button
                type="button"
                key={goal}
                aria-pressed={preferences.goal === goal}
                onClick={() =>
                  onChange({ ...preferences, goal: preferences.goal === goal ? null : goal })
                }
              >
                {goal}
              </button>
            ),
          )}
        </div>
      </fieldset>
    </div>
  );
}
