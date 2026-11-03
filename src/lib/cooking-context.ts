import { z } from "zod";

export const cookingRecipeSchema = z
  .object({
    name: z.string().max(200),
    ingredients: z.array(z.string().max(240)).max(80).optional(),
    steps: z.array(z.string().max(1000)).min(1).max(40),
    step: z.number().int().min(0).max(39),
    completedSteps: z.array(z.number().int().min(0).max(39)).max(40).optional(),
    timing: z.string().max(120).optional(),
    temperature: z.string().max(120).optional(),
    paused: z.boolean().optional(),
  })
  .refine(
    (recipe) =>
      recipe.step < recipe.steps.length &&
      (recipe.completedSteps ?? []).every((index) => index < recipe.steps.length),
    "Invalid recipe step",
  );

export function cookingStepDetails(step: string) {
  // Display only timings and temperatures actually written in the recipe.
  const timing = step.match(
    /\b\d+(?:\s*[-–]\s*\d+)?\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i,
  )?.[0];
  const temperature = step.match(/\b\d{2,3}\s*°?\s*(?:celsius|fahrenheit|[CF]\b)/i)?.[0];
  const minutes = timing?.match(/^(\d+)\s*(minutes?|mins?)$/i);
  const seconds = timing?.match(/^(\d+)\s*(seconds?|secs?)$/i);
  const timerSeconds = minutes ? Number(minutes[1]) * 60 : seconds ? Number(seconds[1]) : null;
  const explicitTip = step.match(/(?:tip|note):\s*(.+)$/i)?.[1];
  const tip =
    explicitTip ??
    (/\bchop|\bdice|\bslice/i.test(step)
      ? "Keep pieces a similar size so they cook evenly."
      : /simmer/i.test(step)
        ? "Look for small, gentle bubbles. Adjust the heat if it boils rapidly."
        : /sauté|saute|fry/i.test(step)
          ? "Keep an eye on colour and stir as the recipe directs."
          : /bake|roast/i.test(step)
            ? "Use the recipe’s doneness cues as well as its cooking time."
            : /mix|stir|whisk/i.test(step)
              ? "Scrape the sides of the bowl or pan for an even mixture."
              : "Set out what you need for this step before you begin.");
  return { timing, temperature, timerSeconds, tip };
}
