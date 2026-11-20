import { Check, TrendingUp } from "lucide-react";
import { DiagramCard } from "@/components/ui/DiagramCard";
import { LogoMark } from "@/components/ui/Logo";

/** One series drives the list, the header and the step chart. */
const SERIES = [
  { label: "Registered", score: 50, limit: 5.0, repaid: false },
  { label: "INV-001 repaid on time", score: 65, limit: 6.5, repaid: true },
  { label: "INV-002 repaid on time", score: 80, limit: 8.0, repaid: true },
];
const fmt = (n: number) => n.toFixed(2);

export function ReputationDiagram() {
  const W = 420;
  const H = 96;
  const pad = 14;
  const max = 10;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (SERIES.length - 1);
  const y = (v: number) => H - 8 - (v / max) * (H - 20);
  // step line: hold each limit until the next event
  const d = SERIES.map((p, i) => (i === 0 ? `M ${x(0)} ${y(p.limit)}` : `H ${x(i)} V ${y(p.limit)}`)).join(" ") + ` H ${W - 2}`;
  const first = SERIES[0];
  const last = SERIES[SERIES.length - 1];
  return (
    <DiagramCard label="ERC-8004 · reputation registry" meta="illustrative">
      <div className="flex items-center gap-3 rounded-[10px] border border-line bg-bg/60 p-3">
        <LogoMark size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold text-ink">Lumen Data (Bengaluru)</p>
          <p className="font-mono text-[11px] text-muted">Agent #12 · seller · score {last.score}</p>
        </div>
        <span className="rounded-full border border-brand-line bg-brand-soft px-2.5 py-1 font-mono text-[11px] text-brand">Band A</span>
      </div>
      <ol className="mt-4 space-y-2.5">
        {SERIES.map((e) => (
          <li key={e.label} className="flex items-center gap-3">
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${e.repaid ? "border-brand bg-brand text-white" : "border-line bg-surface text-muted"}`}>
              {e.repaid ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span className="h-1.5 w-1.5 rounded-full bg-muted" />}
            </span>
            <span className="flex-1 text-[13.5px] text-ink">{e.label}</span>
            <span className="font-mono text-[11.5px] text-muted">
              score {e.score} · limit {fmt(e.limit)}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-5 rounded-[10px] border border-line p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted">Advance limit · tUSD8</span>
          <span className="inline-flex items-center gap-1 font-mono text-[11.5px] text-brand">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden /> {fmt(first.limit)} → {fmt(last.limit)}
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Advance limit by event: ${SERIES.map((s) => fmt(s.limit)).join(", ")} tUSD8`}>
          <line x1="0" x2={W} y1={H - 8} y2={H - 8} stroke="rgb(var(--line))" />
          <path d={`${d} V ${H - 8} H ${x(0)} Z`} fill="rgb(var(--brand-soft))" />
          <path d={d} fill="none" stroke="rgb(var(--brand))" strokeWidth="2" strokeLinejoin="round" />
          {SERIES.map((p, i) => (
            <g key={p.label}>
              <circle cx={x(i)} cy={y(p.limit)} r="4" fill="rgb(var(--brand))" stroke="#fff" strokeWidth="2" />
              <text x={x(i)} y={y(p.limit) - 8} textAnchor="middle" className="fill-ink font-mono" fontSize="11">
                {fmt(p.limit)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </DiagramCard>
  );
}
