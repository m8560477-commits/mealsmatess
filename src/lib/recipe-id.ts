import { z } from "zod";

// Accept existing UUIDs and Firebase document IDs, but never document paths.
export const RecipeIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_500)
  .refine(
    (id) =>
      !id.includes("/") &&
      !Array.from(id).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
      id !== "." &&
      id !== "..",
    "Invalid recipe ID",
  );
