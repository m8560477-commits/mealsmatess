import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CookingMode({
  name,
  steps,
  onClose,
  onComplete,
}: {
  name: string;
  steps: string[];
  onClose: () => void;
  onComplete?: () => void;
}) {
  const [i, setI] = useState(0);
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (seconds === null) return;
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => (s !== null ? Math.max(0, s - 1) : null)), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((v) => Math.min(steps.length - 1, v + 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps.length, onClose]);

  const step = steps[i] ?? "";
  const pct = steps.length ? ((i + 1) / steps.length) * 100 : 0;
  const mm = seconds !== null ? Math.floor(seconds / 60).toString().padStart(2, "0") : "00";
  const ss = seconds !== null ? (seconds % 60).toString().padStart(2, "0") : "00";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Cooking</p>
          <h2 className="truncate font-display text-lg">{name}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close cooking mode">
          <X className="h-5 w-5" />
        </Button>
      </header>

      <div className="h-1 w-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Step {i + 1} of {steps.length}
        </p>
        <p className="mt-6 max-w-2xl text-2xl leading-relaxed md:text-3xl">{step}</p>

        <div className="mt-8 flex items-center gap-2">
          <Timer className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-lg tabular-nums">
            {mm}:{ss}
          </span>
          <div className="ml-2 flex gap-1">
            {[1, 3, 5, 10, 15].map((m) => (
              <Button
                key={m}
                size="sm"
                variant="outline"
                onClick={() => setSeconds(m * 60)}
              >
                {m}m
              </Button>
            ))}
            {seconds !== null && (
              <Button size="sm" variant="ghost" onClick={() => setSeconds(null)}>
                Reset
              </Button>
            )}
          </div>
        </div>
      </main>

      <footer className="flex items-center justify-between gap-3 border-t border-border p-4">
        <Button
          variant="outline"
          onClick={() => setI((v) => Math.max(0, v - 1))}
          disabled={i === 0}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Previous
        </Button>
        {i < steps.length - 1 ? (
          <Button onClick={() => setI((v) => Math.min(steps.length - 1, v + 1))}>
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={() => {
              onComplete?.();
              onClose();
            }}
          >
            Done
          </Button>
        )}
      </footer>
    </div>
  );
}
