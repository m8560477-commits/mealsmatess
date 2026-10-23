import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChefHat, Loader2, Sparkles } from "lucide-react";
import { ChefMascot } from "@/components/chef-mascot";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/hooks/use-preferences";
import { type FoodPreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Personalise your kitchen — MealMate" },
      {
        name: "description",
        content:
          "Create a MealMate cooking profile based on your habits, goals, household and dietary needs.",
      },
      { property: "og:title", content: "Personalise your kitchen — MealMate" },
      {
        property: "og:description",
        content:
          "Create a MealMate cooking profile based on your habits, goals, household and dietary needs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnboardingPage,
});

type Answers = {
  cookingFrequency: string;
  mainChallenge: string;
  mealDecision: string;
  foodWaste: string;
  priority: string;
  cookingTime: string;
  household: string;
  dietary: string[];
  goal: string;
};
type QuestionKey = keyof Answers;
type Stage =
  | "quiz"
  | "results"
  | "impact"
  | "solution"
  | "features"
  | "plan"
  | "premium"
  | "saving"
  | "complete";

const QUESTIONS: {
  key: QuestionKey;
  title: string;
  options: readonly string[];
  multi?: boolean;
}[] = [
  {
    key: "cookingFrequency",
    title: "How often do you cook at home?",
    options: ["Almost every day", "A few times a week", "Occasionally", "Rarely"],
  },
  {
    key: "mainChallenge",
    title: "What's your biggest cooking challenge?",
    options: [
      "I don't know what to cook",
      "I forget what ingredients I have",
      "I waste food before using it",
      "Groceries are getting expensive",
      "Meal planning takes too much time",
      "Finding suitable recipes is difficult",
    ],
  },
  {
    key: "mealDecision",
    title: "How do you decide what to eat?",
    options: [
      "I use whatever is available",
      "I search for recipes",
      "I plan meals in advance",
      "I order food or buy ready-made meals",
    ],
  },
  {
    key: "foodWaste",
    title: "How often do ingredients go unused?",
    options: ["Rarely", "Sometimes", "Often", "I'm not sure"],
  },
  {
    key: "priority",
    title: "What matters most when choosing a recipe?",
    options: [
      "Low cost",
      "Quick preparation",
      "Healthy and balanced meals",
      "Taste and variety",
      "Using ingredients I already have",
    ],
  },
  {
    key: "cookingTime",
    title: "How much time do you have to cook?",
    options: ["Under 15 minutes", "15–30 minutes", "30–45 minutes", "More than 45 minutes"],
  },
  {
    key: "household",
    title: "Who are you usually cooking for?",
    options: ["Just me", "Two people", "A family", "A household with different preferences"],
  },
  {
    key: "dietary",
    title: "Do you have dietary preferences?",
    multi: true,
    options: [
      "No specific preference",
      "Vegetarian",
      "Vegan",
      "High-protein",
      "Gluten-free",
      "Dairy-free",
    ],
  },
  {
    key: "goal",
    title: "What would you most like MealMate to help you achieve?",
    options: [
      "Save money on groceries",
      "Waste less food",
      "Cook more consistently",
      "Discover new recipes",
      "Plan meals for the week",
      "Keep my kitchen organized",
    ],
  },
];

const INITIAL: Answers = {
  cookingFrequency: "",
  mainChallenge: "",
  mealDecision: "",
  foodWaste: "",
  priority: "",
  cookingTime: "",
  household: "",
  dietary: [],
  goal: "",
};
const STAGES: Stage[] = ["quiz", "results", "impact", "solution", "features", "plan", "premium"];

function benefitsFor(a: Answers) {
  const benefits: string[] = [];
  if (a.mainChallenge.includes("don't know"))
    benefits.push("Explore recipe suggestions instead of starting from a blank page.");
  if (a.mainChallenge.includes("ingredients"))
    benefits.push("Keep your recorded ingredients organized in one place.");
  if (a.mainChallenge.includes("waste"))
    benefits.push("Plan meals around recorded ingredients before buying more.");
  if (a.mainChallenge.includes("expensive"))
    benefits.push("Check what you already have before creating your shopping list.");
  if (a.mainChallenge.includes("time"))
    benefits.push("Use your preferred cooking time to narrow down recipe choices.");
  if (a.mainChallenge.includes("suitable"))
    benefits.push("Use your preferences to find more relevant recipes.");
  if (a.goal === "Plan meals for the week")
    benefits.push("Bring your meal decisions together in a weekly plan.");
  benefits.push(`Focus on recipes suited to ${a.cookingTime.toLowerCase() || "your schedule"}.`);
  return [...new Set(benefits)].slice(0, 4);
}

function mapPreferences(current: FoodPreferences, a: Answers): FoodPreferences {
  const restrictions = a.dietary.filter((item) => item !== "No specific preference");
  return {
    ...current,
    goal: a.goal || current.goal,
    dietary_restrictions: restrictions,
    meals_per_day: a.household || current.meals_per_day,
    cooking_time: a.cookingTime || current.cooking_time,
    food_budget: a.priority === "Low cost" ? "Budget friendly" : current.food_budget,
    preferred_features: [
      a.mainChallenge,
      a.mealDecision,
      a.priority,
      a.cookingFrequency,
      a.foodWaste,
    ].filter(Boolean),
    onboarding_completed: true,
  };
}

function OnboardingPage() {
  const navigate = useNavigate();
  const { preferences, save } = usePreferences();
  const [stage, setStage] = useState<Stage>("quiz");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(INITIAL);
  const benefits = useMemo(() => benefitsFor(answers), [answers]);
  const question = QUESTIONS[questionIndex] ?? {
    key: "cookingFrequency" as const,
    title: "How often do you cook at home?",
    options: ["Almost every day"] as const,
  };
  const progress =
    stage === "quiz"
      ? ((questionIndex + 1) / QUESTIONS.length) * 100
      : ((STAGES.indexOf(stage) + 1) / STAGES.length) * 100;

  function selected(option: string) {
    return question.key === "dietary"
      ? answers.dietary.includes(option)
      : answers[question.key] === option;
  }
  function choose(option: string) {
    if (question.key !== "dietary") return setAnswers((a) => ({ ...a, [question.key]: option }));
    setAnswers((a) => ({
      ...a,
      dietary:
        option === "No specific preference"
          ? [option]
          : a.dietary.includes(option)
            ? a.dietary.filter((x) => x !== option)
            : [...a.dietary.filter((x) => x !== "No specific preference"), option],
    }));
  }
  function nextQuestion() {
    if (questionIndex < QUESTIONS.length - 1) setQuestionIndex((i) => i + 1);
    else setStage("results");
  }
  function back() {
    if (stage === "quiz" && questionIndex > 0) return setQuestionIndex((i) => i - 1);
    const i = STAGES.indexOf(stage);
    if (i > 0) setStage(STAGES[i - 1] ?? "quiz");
  }

  async function finish(destination: "/" | "/premium") {
    setStage("saving");
    try {
      await save(mapPreferences(preferences, answers));
      if (destination === "/premium") await navigate({ to: "/premium", replace: true });
      else setStage("complete");
    } catch {
      toast.error("We couldn't save your cooking profile. Please try again.");
      setStage("premium");
    }
  }

  async function enableNotifications() {
    if (typeof Notification === "undefined") {
      toast.message("Notifications aren’t available on this device.");
      setStage("complete");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        toast.success("Notifications enabled.");
      } else {
        toast.message("Notification reminders were not enabled.");
      }
    } catch {
      toast.error("Notifications could not be enabled right now.");
    } finally {
      setStage("complete");
    }
  }

  return (
    <main
      className="fixed inset-0 z-50 overflow-y-auto bg-[#07090d] text-white"
      data-tone={["mint", "coral", "sky", "yellow"][questionIndex % 4]}
    >
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[max(env(safe-area-inset-top),1.25rem)] sm:px-8">
        <header className="mb-7 grid grid-cols-[80px_1fr_80px] items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={back}
            disabled={stage === "quiz" && questionIndex === 0}
            className={cn(
              "justify-self-start rounded-full border border-white/10 bg-white/3 text-white hover:bg-white/7",
              stage === "quiz" && questionIndex === 0 && "invisible",
            )}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <span className="flex items-center gap-2 justify-self-center font-display text-lg font-semibold text-white">
            <ChefHat className="size-5 text-primary" />
            MealMate
          </span>
          <span className="justify-self-end text-xs text-white/60">Your kitchen</span>
        </header>

        {stage !== "complete" && stage !== "saving" && (
          <div className="mb-6 flex gap-1.5" aria-hidden="true">
            {[
              "bg-[#8af0c9]",
              "bg-[#f7b7d4]",
              "bg-[#a8d4ff]",
              "bg-[#f9d88d]",
            ].map((color) => (
              <span key={color} className={cn("h-1.5 flex-1 rounded-full", color)} />
            ))}
          </div>
        )}

        <section className="flex flex-1 flex-col">
          {stage === "quiz" && (
            <div key={questionIndex} className="step-in-right flex flex-1 flex-col">
              <div className="mb-5 flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#8af0c9]/30 bg-[#8af0c9]/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9ff9d5]">
                  <Sparkles className="size-4" />
                  Your kitchen, your way
                </span>
                <div className="shrink-0 rounded-[1.4rem] bg-white/4 p-2 ring-1 ring-white/10 backdrop-blur-sm">
                  <ChefMascot className="size-20 shrink-0" />
                </div>
              </div>

              <div className="mb-4 flex items-center gap-3">
                <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
                  {String(questionIndex + 1).padStart(2, "0")} / {String(QUESTIONS.length).padStart(2, "0")}
                </p>
                <div
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8"
                  role="progressbar"
                  aria-label="Kitchen profile questions"
                  aria-valuenow={Math.round(progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#8af0c9] via-[#d8b8ff] to-[#f7b7d4] transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/[0.02] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.34)] backdrop-blur-sm">
                <h1 className="font-display text-3xl font-semibold leading-tight tracking-[-0.05em] text-white sm:text-4xl">
                  {question.title}
                </h1>
                <p className="mb-6 mt-3 text-sm leading-6 text-white/65">
                  Help us personalize your cooking experience.
                </p>
                <div className="space-y-2.5">
                  {question.options.map((option, index) => (
                    <Button
                      key={option}
                      variant="outline"
                      className={cn(
                        "onboarding-choice h-auto min-h-14 w-full justify-start gap-3 whitespace-normal rounded-2xl border border-white/10 bg-transparent px-3 py-3 text-left text-white hover:bg-white/5",
                        selected(option) && "border-[#ae9cff] bg-[#ae9cff]/10 text-white shadow-[0_0_0_1px_rgba(174,156,255,0.35)]",
                      )}
                      onClick={() => choose(option)}
                      aria-pressed={selected(option)}
                    >
                      <span
                        className={cn(
                          "choice-marker grid size-8 shrink-0 place-items-center rounded-xl text-xs font-bold text-[#09090d]",
                          selected(option)
                            ? "bg-[#b9f9d1] text-[#0d1f15]"
                            : "bg-white/10 text-white/80",
                        )}
                        aria-hidden
                      >
                        {selected(option) ? <Check className="size-4" /> : String.fromCharCode(65 + index)}
                      </span>
                      <span className="flex-1 text-left">{option}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="mt-auto space-y-3 pt-8">
                <Button
                  className="h-13 w-full rounded-full bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.15)] hover:bg-white/95"
                  onClick={nextQuestion}
                  disabled={
                    question.key === "dietary"
                      ? answers.dietary.length === 0
                      : !answers[question.key]
                  }
                >
                  {questionIndex === QUESTIONS.length - 1 ? "Show my results" : "Continue"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  className="w-full rounded-full border border-white/10 bg-white/3 text-white/80 hover:bg-white/6"
                  onClick={nextQuestion}
                >
                  Skip this question
                </Button>
              </div>
            </div>
          )}

          {stage === "results" && (
            <InfoStage
              eyebrow="Your cooking profile"
              title="Your kitchen has more potential."
              text={
                <>
                  Your main challenge is <strong>{answers.mainChallenge || "your cooking routine"}</strong>. MealMate can
                  turn your preferences into practical meal ideas.
                </>
              }
              items={[
                `Your goal: ${answers.goal || "Explore better meal planning"}`,
                `Cooking time: ${answers.cookingTime || "Flexible"}`,
                `Cooking for: ${answers.household || "Not specified"}`,
              ]}
              action="Continue"
              onAction={() => setStage("impact")}
            />
          )}
          {stage === "impact" && (
            <InfoStage
              eyebrow="Your everyday routine"
              title="Make everyday cooking simpler."
              text="A little organization can reduce guesswork and help you make better use of your ingredients and time."
              items={benefits}
              action="Show me the solution"
              onAction={() => setStage("solution")}
            />
          )}
          {stage === "solution" && (
            <InfoStage
              eyebrow="Meet your kitchen companion"
              title="Less guessing. More cooking."
              text="MealMate brings your pantry, recipes, weekly meals and shopping lists into one practical experience."
              items={[
                "Use what you have — start with pantry ingredients.",
                "Plan your meals around your real routine.",
                "Shop with purpose using missing ingredients.",
              ]}
              action="Explore the features"
              onAction={() => setStage("features")}
            />
          )}
          {stage === "features" && (
            <InfoStage
              eyebrow="Your kitchen toolkit"
              title="Everything starts with what you have."
              text="MealMate connects the cooking tools already in your account."
              items={[
                "Pantry-powered recipes",
                "A plan for your week",
                "Smarter shopping lists",
                "Ingredient scanning and tracking",
              ]}
              action="Create my plan"
              onAction={() => setStage("plan")}
            />
          )}
          {stage === "plan" && (
            <InfoStage
              eyebrow="Your personalized starting point"
              title="A plan built around you."
              text="Start with these practical steps, then add your real pantry ingredients for more relevant matching."
              items={[
                "Record the ingredients in your kitchen.",
                `Choose recipes suited to ${answers.cookingTime || "your schedule"}.`,
                `Focus on your goal: ${answers.goal || "better meal planning"}.`,
                "Build your weekly plan and shopping list.",
              ]}
              action="Continue"
              onAction={() => setStage("premium")}
            />
          )}
          {stage === "premium" && (
            <InfoStage
              eyebrow="MealMate Premium"
              title="Make every ingredient count."
              text="Get more ways to plan meals, discover recipes and organize your kitchen with MealMate Premium."
              items={[
                "More recipe inspiration",
                "Personalized meal planning",
                "Organized shopping lists",
                "Expanded pantry tools",
              ]}
              action="View real plans and prices"
              onAction={() => void finish("/premium")}
              secondaryAction="Not now, continue free"
              onSecondary={() => void finish("/")}
            />
          )}
          {stage === "saving" && (
            <div className="my-auto text-center" role="status">
              <Loader2 className="mx-auto size-8 animate-spin text-primary" />
              <h1 className="mt-6 font-display text-3xl text-white">Saving your kitchen profile.</h1>
            </div>
          )}
          {stage === "complete" && (
            <InfoStage
              eyebrow="Welcome to MealMate"
              title="Let's get cooking."
              text="Your preferences are saved. Add your ingredients to start finding meals that suit your kitchen."
              items={[]}
              action="Continue to MealMate"
              onAction={() => navigate({ to: "/", replace: true })}
            />
          )}
        </section>

        {stage !== "complete" && stage !== "saving" && (
          <footer className="pt-8 text-center text-xs uppercase tracking-[0.2em] text-white/45">
            Cook what you already have.
          </footer>
        )}
      </div>
    </main>
  );
}

function InfoStage({
  eyebrow,
  title,
  text,
  items,
  action,
  onAction,
  secondaryAction,
  onSecondary,
}: {
  eyebrow: string;
  title: string;
  text: React.ReactNode;
  items: string[];
  action: string;
  onAction: () => void;
  secondaryAction?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="step-in-right my-auto py-6">
      <div className="mb-5 flex items-center justify-center">
        <div className="rounded-[2rem] border border-white/10 bg-white/4 p-3 shadow-[0_15px_35px_rgba(0,0,0,0.22)] backdrop-blur-sm">
          <ChefMascot className="size-28" animate />
        </div>
      </div>

      <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#9fdaf9]/25 bg-[#a8d4ff]/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#cfeaff]">
        <Sparkles className="size-4" />
        {eyebrow}
      </p>
      <h1 className="font-display text-3xl font-semibold leading-tight tracking-[-0.05em] text-white sm:text-4xl">
        {title}
      </h1>
      <p className="mt-5 leading-7 text-white/70">{text}</p>

      {!!items.length && (
        <div className="mt-7 divide-y divide-white/10 rounded-[1.5rem] border border-white/10 bg-white/[0.02] p-2">
          {items.map((item) => (
            <div key={item} className="flex items-start gap-3 py-4 text-sm text-white/80">
              <span className="choice-marker grid size-8 shrink-0 place-items-center rounded-xl bg-[#d8f7e4] text-[#0d1f15]">
                <Check className="size-4" />
              </span>
              <span className="pt-1">{item}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 space-y-3">
        <Button
          className="h-auto min-h-13 w-full whitespace-normal rounded-full bg-white px-5 py-3 text-base font-semibold text-black shadow-[0_10px_30px_rgba(255,255,255,0.12)] hover:bg-white/95"
          onClick={onAction}
        >
          {action}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        {secondaryAction && onSecondary && (
          <Button
            variant="ghost"
            className="w-full rounded-full border border-white/10 bg-white/3 text-white/80 hover:bg-white/6"
            onClick={onSecondary}
          >
            {secondaryAction}
          </Button>
        )}
      </div>
    </div>
  );
}
