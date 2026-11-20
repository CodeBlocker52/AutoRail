import { ArrowDownToLine } from "lucide-react";
import { DiagramCard } from "@/components/ui/DiagramCard";
import { LogoMark } from "@/components/ui/Logo";

const DAY = (d: number) => `${(d / 60) * 100}%`;
const outflows = [
  { day: 7, label: "Annotators", short: "Annot." },
  { day: 14, label: "GPU", short: "GPU" },
  { day: 21, label: "Experts", short: "Experts" },
  { day: 28, label: "Annotators", short: "Annot." },
];
const implied = [35, 42, 49];

/**
 * Timeline: weekly outflows sit on the Day 0–60 axis, the striped cash gap spans
 * Day 7–60, the lab pays at Day 60, and the Autorail advance (Day 1) bridges into the gap.
 */
export function CashGapDiagram() {
  return (
    <DiagramCard label="Vendor cash flow · one contract" meta="tUSD8" caption="Autorail advances up to 80% on day one">
      <figure aria-label="Timeline: vendor pays weekly from day 7, the lab pays on day 60, Autorail advances on day 1." className="relative px-1 pb-1">
        {/* Row 1: Autorail advance at Day 1 */}
        <div className="relative h-11">
          <div className="absolute left-0 top-0 z-10 flex items-center gap-2 rounded-full border border-brand bg-surface py-1 pl-1 pr-3 shadow-card">
            <LogoMark size={26} />
            <span className="whitespace-nowrap text-[12.5px] font-semibold text-ink">Autorail advance</span>
            <span className="font-mono text-[10.5px] text-brand">Day 1</span>
          </div>
        </div>

        {/* Row 2: cash gap band (Day 7 → 60) + bridging connector */}
        <div className="relative mt-3 h-[76px]">
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 76" preserveAspectRatio="none" aria-hidden>
            {/* from under the advance node (≈ Day 1) down into the band's left edge (Day 7) */}
            <path d="M 4 -14 C 4 22, 6 38, 11.67 38" fill="none" stroke="rgb(var(--brand))" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand" style={{ left: DAY(7) }} aria-hidden />
          <div
            className="absolute inset-y-0 right-0 flex flex-col items-center justify-center rounded-md border border-dashed border-danger/40 text-center"
            style={{ left: DAY(7), background: "repeating-linear-gradient(135deg, rgb(var(--danger-soft)) 0 8px, rgb(var(--surface)) 8px 14px)" }}
          >
            <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-danger">Cash gap</span>
            <span className="mt-0.5 font-serif text-[22px] font-bold leading-none text-ink sm:text-[26px]">~53 days</span>
            <span className="mt-1 text-[11px] text-muted">QA + Net 30–90</span>
          </div>
        </div>

        {/* Row 3: axis with outflows and the lab payment */}
        <div className="relative mt-4 h-[88px]">
          <div className="absolute inset-x-0 top-3 h-px bg-line" aria-hidden />
          {[0, 7, 14, 21, 28, 35, 42, 49, 60].map((d) => (
            <span key={d} className="absolute top-2 h-2 w-px bg-muted/40" style={{ left: DAY(d) }} aria-hidden />
          ))}
          {/* outflow chips, staggered so they never collide */}
          {outflows.map((o, i) => (
            <div key={o.day} className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: DAY(o.day), top: i % 2 ? 40 : 18 }}>
              <span className="mb-0.5 h-2 w-px bg-danger/50" aria-hidden />
              <span className="whitespace-nowrap rounded border border-danger/50 bg-surface px-1.5 py-0.5 text-[10.5px] font-medium text-danger sm:text-[11px]">
                − <span className="sm:hidden">{o.short}</span>
                <span className="hidden sm:inline">{o.label}</span>
              </span>
            </div>
          ))}
          {implied.map((d, i) => (
            <span key={d} className={`absolute h-4 w-6 -translate-x-1/2 rounded border border-dashed border-danger/30 ${d > 42 ? "hidden sm:block" : ""}`} style={{ left: DAY(d), top: i % 2 ? 46 : 24 }} aria-hidden />
          ))}
          <span className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-muted" style={{ left: DAY(42), top: 70 }}>
            + weekly
          </span>
          {/* lab pays at Day 60 */}
          <div className="absolute right-0 top-0 flex translate-x-1 flex-col items-end">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-white shadow-card">
              <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="mt-1.5 whitespace-nowrap text-[12px] font-semibold text-ink">Lab pays</span>
            <span className="font-mono text-[10.5px] text-brand">Day 60</span>
          </div>
          {/* axis labels */}
          <span className="absolute left-0 top-[70px] font-mono text-[10px] uppercase tracking-[0.15em] text-muted">Day 0</span>
        </div>
      </figure>
    </DiagramCard>
  );
}
