import { z } from "zod";
export const COUNTRY_OPTIONS = [
  ["ZA", "South Africa", "ZAR"],
  ["US", "United States", "USD"],
  ["GB", "United Kingdom", "GBP"],
  ["AU", "Australia", "AUD"],
  ["CA", "Canada", "CAD"],
  ["NZ", "New Zealand", "NZD"],
  ["IE", "Ireland", "EUR"],
  ["FR", "France", "EUR"],
  ["DE", "Germany", "EUR"],
  ["IT", "Italy", "EUR"],
  ["IN", "India", "INR"],
  ["NG", "Nigeria", "NGN"],
  ["KE", "Kenya", "KES"],
  ["ZW", "Zimbabwe", "USD"],
  ["BW", "Botswana", "BWP"],
  ["NA", "Namibia", "NAD"],
  ["ZM", "Zambia", "ZMW"],
  ["MZ", "Mozambique", "MZN"],
  ["GH", "Ghana", "GHS"],
  ["BR", "Brazil", "BRL"],
  ["MX", "Mexico", "MXN"],
  ["JP", "Japan", "JPY"],
  ["SG", "Singapore", "SGD"],
  ["AE", "United Arab Emirates", "AED"],
  ["OTHER", "Another country", "USD"],
] as const;
export const LANGUAGE_OPTIONS = [
  ["en", "English"],
  ["zu", "isiZulu"],
  ["af", "Afrikaans"],
  ["xh", "isiXhosa"],
  ["st", "Sesotho"],
  ["tn", "Setswana"],
  ["nso", "Sepedi"],
  ["ve", "Tshivenda"],
  ["ts", "itsonga"],
  ["ss", "Siswati"],
  ["nr", "isiNdebele"],
] as const;
export const FOOD_GOALS = [
  "Eat healthier",
  "Discover new meals",
  "Save money on groceries",
  "Learn to cook",
  "Plan meals for the week",
  "Save time",
  "Explore different cuisines",
  "Support my fitness goals",
  "Organize meals for my family",
];
const strings = (max = 40) => z.array(z.string().trim().min(1).max(100)).max(max);
export const PreferencesSchema = z.object({
  display_name: z.string().trim().max(100).default(""),
  country: z.string().max(60).default(""),
  language: z.string().max(12).default("en"),
  household_size: z.number().int().min(1).max(20).default(1),
  goals: strings().default([]),
  goal: z.string().max(100).nullable().default(null),
  favorite_foods: strings().default([]),
  diets: strings().default([]),
  allergies: strings().default([]),
  dietary_restrictions: strings().default([]),
  disliked_foods: strings().default([]),
  meals_per_day: z.string().max(60).nullable().default(null),
  cooking_level: z.string().max(40).nullable().default(null),
  cooking_time: z.string().max(40).nullable().default(null),
  food_budget: z.string().max(100).nullable().default(null),
  budget_amount: z.number().min(0).max(100000000).nullable().default(null),
  budget_period: z.enum(["day", "week", "month"]).default("week"),
  budget_currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("USD"),
  meal_types: strings(4).default(["Dinner"]),
  planning_style: z.enum(["individual", "week", "household"]).default("individual"),
  reminders: strings(5).default([]),
  preferred_features: strings().default([]),
  onboarding_step: z.number().int().min(0).max(11).default(0),
  onboarding_completed: z.boolean().default(false),
  updated_at: z.string().nullable().default(null),
});
export type PersonalPreferences = z.infer<typeof PreferencesSchema>;
export function currencyForCountry(country: string) {
  return COUNTRY_OPTIONS.find(([code]) => code === country)?.[2] ?? "USD";
}
export function assertRequiredAnswers(p: PersonalPreferences) {
  if (
    !p.display_name ||
    !p.country ||
    !p.goals.length ||
    !p.cooking_level ||
    !p.cooking_time ||
    !p.meal_types.length
  )
    throw new Error(
      "Please complete your name, country, goals, cooking level, time, and meal routine.",
    );
}
