import { Check, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface TimelineStep {
  label: string;
  sub?: string;
  status: "done" | "current" | "todo" | "error" | "warning";
}

/** Horizontal state stepper on ≥sm; stacks vertically on mobile. */
export function StepTimeline({ steps, className }: { steps: TimelineStep[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col gap-3 sm:flex-row sm:gap-0", className)}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.label} className="relative flex items-start gap-3 sm:flex-1 sm:flex-col sm:gap-2" aria-current={s.status === "current" ? "step" : undefined}>
            {!last && (
              <span aria-hidden className={cn("absolute left-[13px] top-7 h-[calc(100%-4px)] w-px sm:left-7 sm:top-[13px] sm:h-px sm:w-[calc(100%-28px)]", s.status === "done" ? "bg-brand" : "bg-line")} />
            )}
            <span
              className={cn(
                "relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-[11px]",
                s.status === "done" && "border-brand bg-brand text-white",
                s.status === "current" && "border-brand bg-brand-soft text-brand ring-4 ring-brand-soft",
                s.status === "todo" && "border-line bg-surface text-muted",
                s.status === "error" && "border-danger bg-danger-soft text-danger",
                s.status === "warning" && "border-warning bg-[#FBF3E2] text-warning",
              )}
            >
              {s.status === "done" ? <Check className="h-3.5 w-3.5" /> : s.status === "error" ? <X className="h-3.5 w-3.5" /> : String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 sm:pr-3">
              <p className={cn("text-[14px] font-medium", s.status === "todo" ? "text-muted" : "text-ink")}>{s.label}</p>
              {s.sub && <p className="font-mono text-[11.5px] text-muted">{s.sub}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
