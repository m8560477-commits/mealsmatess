import chef from "@/assets/mealmate-chef.png";
import { cn } from "@/lib/utils";

export function ChefMascot({ className, animate = false }: { className?: string; animate?: boolean }) {
  return <img src={chef} alt="MealMate avocado chef" width={1024} height={1024} className={cn("object-contain", animate && "mascot-float", className)} />;
}