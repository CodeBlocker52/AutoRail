import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ReceivableState } from "@/lib/autorail/types";

export type Tone = "neutral" | "brand" | "solid" | "danger" | "warning" | "outline";
const tones: Record<Tone, string> = {
  neutral: "bg-bg-alt text-text border-line",
  brand: "bg-brand-soft text-brand border-brand-line",
  solid: "bg-brand text-white border-brand",
  danger: "bg-danger-soft text-danger border-danger/25",
  warning: "bg-[#FBF3E2] text-warning border-warning/25",
  outline: "bg-transparent text-muted border-line",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em]", tones[tone], className)}>
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATE_TONE: Record<ReceivableState, Tone> = {
  Created: "neutral",
  Confirmed: "outline",
  Funded: "brand",
  Repaid: "solid",
  Overdue: "warning",
  Defaulted: "danger",
};

export function StateBadge({ state, className }: { state: ReceivableState; className?: string }) {
  return (
    <Badge tone={STATE_TONE[state]} dot className={className}>
      {state}
    </Badge>
  );
}
