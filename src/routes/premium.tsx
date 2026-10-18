import { createFileRoute } from "@tanstack/react-router";
import { SubscriptionOptions } from "@/components/subscription-options";
export const Route = createFileRoute("/premium")({
  head: () => ({
    meta: [
      { title: "MealMate Premium" },
      {
        name: "description",
        content: "Personalized cooking, planning and nutrition with MealMate Premium.",
      },
    ],
  }),
  component: PremiumPage,
});
function PremiumPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <SubscriptionOptions />
    </main>
  );
}
