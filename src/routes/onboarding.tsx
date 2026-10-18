import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { usePreferences } from "@/hooks/use-preferences";
import { useSession } from "@/hooks/use-session";
import { type FoodPreferences, preferenceSummary, writeLocalPreferences } from "@/lib/preferences";
import {
  COUNTRY_OPTIONS,
  LANGUAGE_OPTIONS,
  FOOD_GOALS,
  currencyForCountry,
  assertRequiredAnswers,
} from "@/lib/onboarding-model";
import {
  createOnboardingExperience,
  getOnboardingExperience,
  completeOnboarding,
} from "@/lib/onboarding.functions";
import { SubscriptionOptions } from "@/components/subscription-options";
import { ChefMascot } from "@/components/chef-mascot";
import { RecipeImage } from "@/components/recipe-image";
import { Button } from "@/components/ui/button";
import bowlPhoto from "@/assets/recipes/rainbow-buddha-bowl.webp";
import jollofPhoto from "@/assets/recipes/west-african-jollof-rice.webp";
import chickenPhoto from "@/assets/recipes/greek-chicken-salad.webp";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Your MealMate, personalized" }] }),
  component: OnboardingPage,
});
const titles = [
  "Let's make food work for you.",
  "A little about you",
  "What brings you to the table?",
  "Food that feels right",
  "What do you love eating?",
  "Your kitchen, your pace",
  "Make your budget go further",
  "Find your rhythm",
  "Meet your MealMate",
  "Creating your experience",
  "Made for you",
  "Your personalized food journey starts here.",
];
const foods = [
  "Chicken",
  "Beef",
  "Fish",
  "Rice dishes",
  "Pasta",
  "Vegetables",
  "Traditional South African meals",
  "Indian cuisine",
  "Italian cuisine",
  "Asian cuisine",
  "Fast food",
  "Vegetarian meals",
];
function Choices({
  options,
  value,
  onChange,
  single = false,
}: {
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  single?: boolean;
}) {
  return (
    <div className="onboarding-choices">
      {options.map((option) => (
        <button
          type="button"
          className="onboarding-choice"
          aria-pressed={value.includes(option)}
          key={option}
          onClick={() =>
            onChange(
              single
                ? [option]
                : value.includes(option)
                  ? value.filter((v) => v !== option)
                  : [...value, option],
            )
          }
        >
          <span>{option}</span>
          {value.includes(option) && <Check className="h-4 w-4 shrink-0" />}
        </button>
      ))}
    </div>
  );
}
function Tags({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [text, setText] = useState("");
  function add() {
    const next = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (next.length) onChange([...new Set([...value, ...next])].slice(0, 40));
    setText("");
  }
  return (
    <fieldset className="space-y-2">
      <legend>{label}</legend>
      <div className="flex gap-2">
        <input
          className="onboarding-input"
          aria-label={label}
          placeholder="Type an ingredient, then Add"
          value={text}
          maxLength={100}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
        />
        <Button type="button" variant="outline" onClick={add}>
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {value.map((v) => (
          <button
            type="button"
            className="rounded-full border px-3 py-1 text-sm"
            key={v}
            aria-label={`Remove ${v}`}
            onClick={() => onChange(value.filter((item) => item !== v))}
          >
            {v} ×
          </button>
        ))}
      </div>
    </fieldset>
  );
}
function OnboardingPage() {
  const { user } = useSession();
  const pref = usePreferences();
  if (!user)
    return (
      <main className="p-8">
        <h1>Make MealMate yours</h1>
        <Link to="/auth">Sign in to save your progress</Link>
      </main>
    );
  if (pref.loading)
    return (
      <p className="p-8" role="status">
        Loading your saved preferences…
      </p>
    );
  if (pref.error)
    return (
      <main className="p-8">
        <p role="alert">We couldn't load your saved preferences. Please retry before editing.</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </main>
    );
  return (
    <OnboardingFlow key={user.id} userId={user.id} initial={pref.preferences} save={pref.save} />
  );
}
function OnboardingFlow({
  userId,
  initial,
  save,
}: {
  userId: string;
  initial: FoodPreferences;
  save: (p: FoodPreferences) => Promise<void>;
}) {
  const [answers, setAnswers] = useState(initial);
  const [step, setStep] = useState(initial.onboarding_completed ? 1 : initial.onboarding_step);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const latest = useRef(answers);
  const queue = useRef(Promise.resolve());
  const navigate = useNavigate();
  const qc = useQueryClient();
  const experience = useQuery({
    queryKey: ["onboarding-experience", userId],
    queryFn: () => getOnboardingExperience(),
  });
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    content.current?.focus();
    document.getElementById("app-scroll")?.scrollTo({ top: 0 });
  }, [step]);
  function update(patch: Partial<FoodPreferences>) {
    const next = { ...latest.current, ...patch, updated_at: new Date().toISOString() };
    latest.current = next;
    setAnswers(next);
    setDirty(true);
    writeLocalPreferences(next, userId);
    setStatus("Saved on this device");
  }
  function persist(value: FoodPreferences) {
    const task = queue.current.catch(() => undefined).then(() => save(value));
    queue.current = task;
    return task;
  }
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      const value = latest.current;
      void persist(value)
        .then(() => {
          if (latest.current === value) {
            setDirty(false);
            setStatus("Progress saved");
          }
        })
        .catch(() => setStatus("Saved on this device. Continue to retry syncing."));
    }, 600);
    return () => clearTimeout(timer);
    // Local edits deliberately drive the save queue; remote refreshes never replace in-progress answers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, dirty]);
  async function go(nextStep: number) {
    setBusy(true);
    setError("");
    try {
      if (nextStep > step) {
        if (step === 1 && (!answers.display_name.trim() || !answers.country))
          throw new Error("Please enter your name and country.");
        if (step === 2 && !answers.goals.length) throw new Error("Choose at least one food goal.");
        if (step === 5 && (!answers.cooking_level || !answers.cooking_time))
          throw new Error("Choose your cooking level and usual time.");
        if (step === 7) assertRequiredAnswers(answers);
      }
      const next = { ...latest.current, onboarding_step: nextStep };
      update(next);
      await persist(next);
      setDirty(false);
      setStep(nextStep);
      setStatus("Progress saved");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Your progress is kept on this device.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    setBusy(true);
    setError("");
    try {
      await persist(latest.current);
      const result = await createOnboardingExperience();
      qc.setQueryData(["onboarding-experience", userId], result);
      const next = { ...latest.current, onboarding_step: 10 };
      update(next);
      await persist(next);
      setDirty(false);
      setStep(10);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not create your experience. Your preferences are saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    await persist({ ...latest.current, onboarding_step: 11 });
    await completeOnboarding();
    await qc.invalidateQueries({ queryKey: ["preferences", userId] });
    await qc.invalidateQueries({ queryKey: ["recipes"] });
    await navigate({ to: "/" });
  }
  const selection = (
    key: "goals" | "diets" | "favorite_foods" | "meal_types" | "reminders",
    options: readonly string[],
  ) => (
    <Choices
      options={options}
      value={answers[key]}
      onChange={(value) => update({ [key]: value })}
    />
  );
  return (
    <main className="onboarding-shell" ref={content} tabIndex={-1}>
      <header className="flex items-center justify-between gap-3">
        <Link to="/" className="font-display text-xl">
          MealMate
        </Link>
        <span className="text-xs tracking-widest">YOUR FOOD. YOUR WAY.</span>
      </header>
      <div className="mt-6 flex justify-between text-xs">
        <span>{step + 1} / 12</span>
        <span aria-live="polite">{status}</span>
      </div>
      <progress
        className="onboarding-progress"
        max={12}
        value={step + 1}
        aria-label={`Step ${step + 1} of 12`}
      />
      <section key={step} inert={busy} className="onboarding-step space-y-6">
        {step !== 11 && (
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">{titles[step]}</h1>
        )}
        {step === 0 && (
          <>
            <p className="text-lg">
              A MealMate experience built around your life, your taste and your goals.
            </p>
            <img
              className="onboarding-hero"
              src={bowlPhoto}
              alt="A colourful bowl of fresh vegetables, grains and greens"
            />
            <div className="flex items-center gap-3">
              <ChefMascot className="h-20 w-20" />
              <p>Hi, I'm Mia. Let's find food you'll look forward to.</p>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <label className="block">
              What should we call you?
              <input
                className="onboarding-input"
                autoComplete="given-name"
                maxLength={100}
                value={answers.display_name}
                onChange={(e) => update({ display_name: e.target.value })}
              />
            </label>
            <label className="block">
              What country are you in?
              <select
                className="onboarding-input"
                value={answers.country}
                onChange={(e) =>
                  update({
                    country: e.target.value,
                    budget_currency: currencyForCountry(e.target.value),
                  })
                }
              >
                <option value="">Select your country</option>
                {COUNTRY_OPTIONS.map(([code, name]) => (
                  <option value={code} key={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Which language do you prefer?
              <select
                className="onboarding-input"
                value={answers.language}
                onChange={(e) => update({ language: e.target.value })}
              >
                {LANGUAGE_OPTIONS.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              How many people do you usually cook for?
              <input
                className="onboarding-input"
                type="number"
                min={1}
                max={20}
                value={answers.household_size}
                onChange={(e) =>
                  update({ household_size: Math.min(20, Math.max(1, Number(e.target.value))) })
                }
              />
            </label>
          </>
        )}
        {step === 2 && (
          <>
            <p>Pick as many as you like. Your goals can change with you.</p>
            {selection("goals", FOOD_GOALS)}
          </>
        )}
        {step === 3 && (
          <>
            <Choices
              options={[
                "No specific diet",
                "Vegetarian",
                "Vegan",
                "Pescatarian",
                "High-protein",
                "Gluten-free",
                "Dairy-free",
                "Halal",
                "Kosher",
              ]}
              value={answers.diets.length ? answers.diets : ["No specific diet"]}
              onChange={(value) =>
                update({
                  diets:
                    value[value.length - 1] === "No specific diet"
                      ? []
                      : value.filter((v) => v !== "No specific diet"),
                })
              }
            />
            <Tags
              label="Allergies"
              value={answers.allergies}
              onChange={(value) => update({ allergies: value })}
            />
            <Tags
              label="Dietary restrictions"
              value={answers.dietary_restrictions}
              onChange={(value) => update({ dietary_restrictions: value })}
            />
            <Tags
              label="Ingredients you prefer to avoid"
              value={answers.disliked_foods}
              onChange={(value) => update({ disliked_foods: value })}
            />
            <p className="text-sm">
              We'll exclude known conflicts from recommendations. Always check ingredient labels and
              preparation for cross-contact.
            </p>
          </>
        )}
        {step === 4 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <img src={chickenPhoto} className="onboarding-food-photo" alt="Greek chicken salad" />
              <img
                src={jollofPhoto}
                className="onboarding-food-photo"
                alt="West African jollof rice"
              />
            </div>
            <label className="block">
              Search foods and cuisines
              <input
                className="onboarding-input"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <Choices
              options={[
                ...new Set([
                  ...foods,
                  ...answers.favorite_foods,
                  ...(search.trim() ? [search.trim()] : []),
                ]),
              ].filter((v) => v.toLowerCase().includes(search.toLowerCase()))}
              value={answers.favorite_foods}
              onChange={(value) => update({ favorite_foods: value })}
            />
          </>
        )}
        {step === 5 && (
          <>
            <h2>Your cooking level</h2>
            <Choices
              options={["Beginner", "Intermediate", "Experienced"]}
              value={answers.cooking_level ? [answers.cooking_level] : []}
              single
              onChange={(v) => update({ cooking_level: v[0] })}
            />
            <h2>How much time do you normally have?</h2>
            <Choices
              options={["Under 15 minutes", "15–30 minutes", "30–60 minutes", "More than an hour"]}
              value={answers.cooking_time ? [answers.cooking_time] : []}
              single
              onChange={(v) => update({ cooking_time: v[0] })}
            />
          </>
        )}
        {step === 6 && (
          <>
            <p>
              A guide for practical meal suggestions, not a spending target. Grocery prices vary.
            </p>
            <label className="block">
              Food or grocery budget ({answers.budget_currency})
              <input
                className="onboarding-input"
                type="number"
                min={0}
                max={100000000}
                step="0.01"
                placeholder="Not sure yet"
                value={answers.budget_amount ?? ""}
                onChange={(e) =>
                  update({ budget_amount: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </label>
            <Choices
              options={["day", "week", "month"]}
              value={[answers.budget_period]}
              single
              onChange={(v) => update({ budget_period: v[0] as FoodPreferences["budget_period"] })}
            />
            <Button
              variant="outline"
              onClick={() => {
                update({ budget_amount: null });
                void go(7);
              }}
            >
              Not sure yet
            </Button>
          </>
        )}
        {step === 7 && (
          <>
            <h2>Which meals matter most?</h2>
            {selection("meal_types", ["Breakfast", "Lunch", "Dinner", "Snacks"])}
            <h2>How would you like to plan?</h2>
            <Choices
              options={["Individual meals", "An entire week", "Meals for a household"]}
              value={[
                {
                  individual: "Individual meals",
                  week: "An entire week",
                  household: "Meals for a household",
                }[answers.planning_style],
              ]}
              single
              onChange={(v) =>
                update({
                  planning_style:
                    v[0] === "An entire week"
                      ? "week"
                      : v[0] === "Meals for a household"
                        ? "household"
                        : "individual",
                })
              }
            />
            <h2>Reminders you'd find useful</h2>
            {selection("reminders", [
              "Meal planning",
              "Cooking",
              "Grocery shopping",
              "Use ingredients before they expire",
            ])}
            <p className="text-sm">
              These choices save your interests. Enable supported notifications in Profile when
              you're ready; we won't ask for permission here.
            </p>
          </>
        )}
        {step === 8 && (
          <>
            <ChefMascot className="h-28 w-28" />
            <h2 className="font-display text-2xl">You're all set, {answers.display_name}!</h2>
            <p>Your MealMate will focus on {answers.goals.join(", ").toLowerCase()}.</p>
            <div className="rounded-2xl border p-5 text-sm leading-relaxed">
              {preferenceSummary(answers)}
            </div>
            <p>
              Next, Mia will use your answers to prepare real starter recipes and a suggested plan.
            </p>
          </>
        )}
        {step === 9 && (
          <>
            <ChefMascot className="h-28 w-28" />
            <p>
              We'll select suitable recipes, prepare your first plan and ask Mia for a personal
              greeting and ideas.
            </p>
            {busy ? (
              <div role="status" className="flex items-center gap-3">
                <Loader2 className="animate-spin" />
                Preparing your recipes and Mia's suggestions…
              </div>
            ) : (
              <Button onClick={() => void generate()}>Create my experience</Button>
            )}
            <p className="text-sm">
              This may take a moment. If it fails, your answers stay saved and you can retry.
            </p>
          </>
        )}
        {step === 10 && (
          <>
            {experience.isLoading ? (
              <p role="status">Loading your preview…</p>
            ) : experience.data ? (
              <>
                <p className="text-lg">{experience.data.greeting}</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  {experience.data.recipes.map((recipe, i) => (
                    <article key={recipe.id} className="overflow-hidden rounded-2xl border">
                      <RecipeImage recipe={recipe} className="aspect-square w-full object-cover" />
                      <div className="space-y-2 p-4">
                        <h2 className="font-semibold">{recipe.name}</h2>
                        <p className="text-sm">
                          {recipe.cooking_time_minutes
                            ? `${recipe.cooking_time_minutes} min · `
                            : ""}
                          {recipe.difficulty}
                        </p>
                        <p className="text-sm">{experience.data!.explanations[i]}</p>
                      </div>
                    </article>
                  ))}
                </div>
                <h2 className="font-display text-xl">Your suggested first plan</h2>
                <p className="text-sm">
                  A starting point for your household of {answers.household_size}. Review and save
                  it in Planner after setup.
                </p>
                <ul className="space-y-2">
                  {experience.data.plan.map((item, i) => (
                    <li className="rounded-xl border p-3" key={i}>
                      Day {item.day} · {item.meal}: {item.name}
                    </li>
                  ))}
                </ul>
                <h2 className="font-display text-xl">Ask Mia</h2>
                <ul>
                  {experience.data.prompts.map((prompt) => (
                    <li className="my-2 rounded-xl border p-3" key={prompt}>
                      {prompt}
                    </li>
                  ))}
                </ul>
                {!!experience.data.shoppingTips.length && (
                  <>
                    <h2>Budget-aware shopping ideas</h2>
                    <ul>
                      {experience.data.shoppingTips.map((tip) => (
                        <li className="my-2" key={tip}>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {initial.onboarding_completed && (
                  <Button onClick={() => void navigate({ to: "/" })}>Save and return home</Button>
                )}
              </>
            ) : (
              <p role="alert">
                Your preview isn't available. Go back and create your experience again.
              </p>
            )}
            <Button variant="outline" disabled={busy} onClick={() => void go(1)}>
              Edit preferences
            </Button>
          </>
        )}
        {step === 11 && <SubscriptionOptions onContinue={finish} />}
        {error && (
          <p role="alert" className="rounded-xl border border-red-500 p-3">
            {error}
          </p>
        )}
      </section>
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        {step > 0 ? (
          <Button variant="outline" disabled={busy} onClick={() => void go(step - 1)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        ) : (
          <span />
        )}
        {[3, 4].includes(step) && (
          <button className="text-sm underline" disabled={busy} onClick={() => void go(step + 1)}>
            Skip
          </button>
        )}
        {step < 11 && step !== 9 && (
          <Button
            disabled={busy || (step === 10 && !experience.data)}
            onClick={() => void go(step + 1)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {step === 0 ? "Personalize my experience" : "Continue"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </footer>
    </main>
  );
}
