import { formatAmount } from "@/lib/autorail/format";
import { cn } from "@/lib/cn";

export interface WaterfallSegment {
  label: string;
  amount: bigint;
  tone: "brand" | "brand-mid" | "soft" | "muted";
}
const toneCls = {
  brand: "bg-brand text-white",
  "brand-mid": "bg-[#4E7A6B] text-white",
  soft: "bg-brand-soft text-brand border border-brand-line",
  muted: "bg-bg-alt text-muted border border-line",
};

/** One payment split left→right in waterfall order: vault principal → fee → vendor. */
export function WaterfallBar({ total, segments, note, className, caption }: { total: bigint; segments: WaterfallSegment[]; note?: string; caption?: string; className?: string }) {
  const sum = segments.reduce((s, x) => s + x.amount, 0n) || 1n;
  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="eyebrow !text-[11.5px]">Lab payment</span>
        <span className="font-mono text-[15px] text-ink">{formatAmount(total)} tUSD8</span>
      </div>
      <div className="flex h-11 w-full gap-[3px] overflow-hidden rounded-btn" role="img" aria-label={segments.map((s) => `${s.label} ${formatAmount(s.amount)}`).join(", ")}>
        {segments.map((s) => {
          const w = Math.max(Number((s.amount * 10_000n) / sum) / 100, s.amount > 0n ? 2.5 : 0);
          return (
            <div key={s.label} className={cn("flex min-w-0 items-center justify-center overflow-hidden font-mono text-[12px]", toneCls[s.tone])} style={{ width: `${w}%` }}>
              {w > 9 && formatAmount(s.amount)}
            </div>
          );
        })}
      </div>
      <ol className="mt-4 divide-y divide-line rounded-[10px] border border-line">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2.5 px-3 py-2 text-[13.5px]">
            <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
            <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", toneCls[s.tone])} />
            <span className="text-text">{s.label}</span>
            <span className="ml-auto font-mono text-ink">{formatAmount(s.amount)}</span>
          </li>
        ))}
      </ol>
      {note && <p className="mt-2 text-[13px] text-muted">{note}</p>}
      {caption && <p className="mt-3 font-mono text-[11.5px] uppercase tracking-[0.12em] text-brand">{caption}</p>}
    </div>
  );
}
