import { formatAmount } from "@/lib/autorail/format";
import { cn } from "@/lib/cn";

/** variant "cap": amber near the limit, red over it. variant "budget": always brand (a full budget line is complete, not blocked). */
export function SpendCapBar({ spent, cap, label, className, variant = "cap" }: { spent: bigint; cap: bigint; label?: string; className?: string; variant?: "cap" | "budget" }) {
  const pct = cap === 0n ? 0 : Math.min(100, Number((spent * 10_000n) / cap) / 100);
  const over = spent > cap;
  const tone = variant === "budget" ? (over ? "bg-danger" : "bg-brand") : over ? "bg-danger" : pct >= 85 ? "bg-warning" : "bg-brand";
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
        {label && <span className="truncate text-text">{label}</span>}
        <span className="ml-auto font-mono text-[12px] text-muted">
          <span className="text-ink">{formatAmount(spent)}</span> / {formatAmount(cap)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-bg-alt" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={`${label ?? "Spent"}: ${Math.round(pct)}% of cap`}>
        <div className={cn("h-full rounded-full transition-[width] duration-500", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
