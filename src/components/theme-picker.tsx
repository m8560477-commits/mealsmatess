import { Check, Lock, Loader2 } from "lucide-react";
import { useMascotTheme } from "@/hooks/use-mascot-theme";
import { usePremium } from "@/hooks/use-premium";
import { useUpgradeModal } from "@/components/upgrade-modal";
import { MASCOT_THEMES } from "@/lib/mascot-theme";
import { cn } from "@/lib/utils";

/** Native-style mascot theme setting. Colourful themes are Premium, matching the artwork. */
export function ThemePicker() {
  const { theme, setTheme, saving } = useMascotTheme();
  const { isPremium } = usePremium();
  const { open } = useUpgradeModal();

  return (
    <section className="mt-6" aria-labelledby="theme-heading">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 id="theme-heading" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          App theme
        </h2>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Saving" />}
      </div>
      <div className="rounded-3xl border border-border bg-card p-3">
        <div role="radiogroup" aria-label="Mascot theme" className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {MASCOT_THEMES.map((t) => {
            const selected = t.id === theme.id;
            const locked = t.premium && !isPremium;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${t.name}${locked ? " (Premium)" : ""}`}
                onClick={() => (locked ? open(`Unlock the ${t.name} theme with MealMate Premium.`) : void setTheme(t.id))}
                className="group flex flex-col items-center gap-2 rounded-2xl p-1.5 text-center transition-transform active:scale-95"
              >
                <span
                  className={cn(
                    "relative block aspect-square w-full overflow-hidden rounded-2xl border-2 transition-colors",
                    selected ? "border-foreground" : "border-transparent",
                  )}
                >
                  <img src={t.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                  {locked && (
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/90">
                      <Lock className="h-3 w-3" />
                    </span>
                  )}
                  {selected && (
                    <span className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background motion-safe:animate-in motion-safe:zoom-in-50">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="h-2 w-2 rounded-full" style={{ background: t.accent }} aria-hidden="true" />
                  {t.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
