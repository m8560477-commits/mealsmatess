import chef from "@/assets/mealmate-chef-ui.webp";
import { cn } from "@/lib/utils";

export function ChefMascot({
  className,
  animate = false,
}: {
  className?: string;
  animate?: boolean;
}) {
  return (
    <img
      src={chef}
      alt="MealMate avocado chef"
      width={192}
      height={192}
      className={cn("object-contain", animate && "mascot-float", className)}
    />
  );
}
