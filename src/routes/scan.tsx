import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MealMateScanner } from "@/components/mealmate-scanner";
import { ScanModeSchema, type ScanMode } from "@/lib/scanner";

export const Route = createFileRoute("/scan")({
  validateSearch: (search: Record<string, unknown>): { mode?: ScanMode } => ({
    mode: ScanModeSchema.catch("dish").parse(search["mode"]),
  }),
  head: () => ({
    meta: [
      { title: "Food Scanner — MealMate" },
      {
        name: "description",
        content:
          "Scan food, ingredients, recipes and product barcodes inside MealMate. See sourced nutrition information and clearly labeled AI estimates.",
      },
      { property: "og:title", content: "Food Scanner — MealMate" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScanPage,
});

function ScanPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <MealMateScanner key={mode} initialMode={mode} onCancel={() => void navigate({ to: "/" })} />
  );
}
