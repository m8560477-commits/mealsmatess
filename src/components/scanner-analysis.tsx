import { AlertCircle, Check, Circle, Loader2 } from "lucide-react";
import { SCAN_STEPS, type ScanProgress } from "@/lib/scanner";

const stateLabels = {
  waiting: "Waiting",
  active: "In progress",
  completed: "Completed",
  attention: "Needs attention",
  failed: "Failed",
};
export function ScannerAnalysis({ progress }: { progress: ScanProgress }) {
  return (
    <section className="scanner-panel p-4" aria-label="Scan analysis">
      <h2 className="font-display text-lg">Scan analysis</h2>
      <ol className="mt-4 space-y-4" aria-live="polite" aria-relevant="text">
        {SCAN_STEPS.map(({ id, label }) => {
          const { status, message } = progress[id];
          const Icon =
            status === "active"
              ? Loader2
              : status === "completed"
                ? Check
                : status === "attention" || status === "failed"
                  ? AlertCircle
                  : Circle;
          return (
            <li key={id} className="flex items-start gap-3" data-scan-step={id} data-state={status}>
              <Icon
                aria-hidden="true"
                className={`mt-0.5 size-5 shrink-0 ${status === "active" ? "animate-spin text-blue-300" : status === "attention" || status === "failed" ? "text-amber-200" : status === "waiting" ? "text-slate-500" : "text-blue-200"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                  <h3 className="text-sm font-semibold">{label}</h3>
                  <span className="text-xs text-slate-400">{stateLabels[status]}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">{message}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
