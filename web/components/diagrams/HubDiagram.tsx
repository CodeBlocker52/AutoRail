"use client";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Spoke {
  label: string;
  sub?: string;
  variant: "ok" | "blocked";
}

const W = 600;
const H = 360;

function layout(spokes: Spoke[]) {
  const ok = spokes.filter((s) => s.variant === "ok");
  const bad = spokes.filter((s) => s.variant === "blocked");
  const [left, right] = bad.length && ok.length ? [ok, bad] : [spokes.filter((_, i) => i % 2 === 0), spokes.filter((_, i) => i % 2 === 1)];
  const place = (list: Spoke[], x: number) =>
    list.map((s, i) => ({ s, x, y: list.length === 1 ? H / 2 : 56 + (i * (H - 112)) / (list.length - 1) }));
  return [...place(left, 108), ...place(right, W - 108)];
}

/** Centre node with spokes. ok spokes are solid with a check; blocked spokes are dashed red with an X. */
export function HubDiagram({ hub, hubSub, spokes, hubIcon, className }: { hub: string; hubSub?: string; spokes: Spoke[]; hubIcon?: ReactNode; className?: string }) {
  const nodes = layout(spokes);
  const cx = W / 2;
  const cy = H / 2;
  return (
    <div className={className}>
      {/* ≥ sm: radial diagram */}
      <div className="relative mx-auto hidden aspect-[600/360] w-full max-w-[620px] sm:block">
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
          {nodes.map(({ s, x, y }, i) => {
            const dir = x < cx ? -1 : 1;
            const d = `M${cx + dir * 72} ${cy} C ${cx + dir * 120} ${cy}, ${x - dir * 130} ${y}, ${x - dir * 96} ${y}`;
            const ok = s.variant === "ok";
            return (
              <g key={s.label}>
                <path d={d} fill="none" stroke={ok ? "rgb(var(--brand))" : "rgb(var(--danger))"} strokeOpacity={ok ? 0.55 : 0.6} strokeWidth="1.5" strokeDasharray={ok ? undefined : "5 5"} />
                <motion.path
                    className="motion-reduce:hidden"
                    d={d}
                    fill="none"
                    stroke="rgb(var(--surface))"
                    strokeWidth="4"
                    initial={{ pathLength: 1, pathOffset: 0 }}
                    whileInView={{ pathLength: 0, pathOffset: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, delay: 0.15 + i * 0.08, ease: "easeInOut" }}
                />
                <circle cx={x - dir * 96} cy={y} r="3" fill={ok ? "rgb(var(--brand))" : "rgb(var(--danger))"} />
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r="72" fill="rgb(var(--brand))" className="hub-pulse" />
        </svg>
        <div className="absolute left-1/2 top-1/2 z-10 grid aspect-square w-[24%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-brand p-4 text-center text-white shadow-lift">
          <div>
            {hubIcon && <div className="mb-1 flex justify-center">{hubIcon}</div>}
            <p className="text-[13px] font-semibold leading-tight lg:text-[14px]">{hub}</p>
            {hubSub && <p className="mt-1 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.2em] text-white/75 lg:text-[10px]">{hubSub}</p>}
          </div>
        </div>
        {nodes.map(({ s, x, y }) => (
          <div key={s.label} className="absolute z-10 w-[33%] -translate-x-1/2 -translate-y-1/2" style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}>
            <SpokeChip spoke={s} />
          </div>
        ))}
      </div>
      {/* < sm: stacked list */}
      <div className="sm:hidden">
        <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full bg-brand px-4 py-2 text-white">
          {hubIcon}
          <span className="text-[13px] font-semibold">{hub}</span>
        </div>
        <ul className="space-y-2">
          {spokes.map((s) => (
            <li key={s.label}>
              <SpokeChip spoke={s} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SpokeChip({ spoke }: { spoke: Spoke }) {
  const ok = spoke.variant === "ok";
  return (
    <div className={cn("flex items-center gap-2 rounded-[10px] border bg-surface px-2.5 py-2 shadow-card", ok ? "border-brand-line" : "border-danger/40 bg-danger-soft")}>
      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full", ok ? "bg-brand text-white" : "bg-danger text-white")}>
        {ok ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
      </span>
      <div className="min-w-0 leading-tight">
        <p className={cn("truncate text-[12.5px] font-medium", ok ? "text-ink" : "text-danger")}>{spoke.label}</p>
        {spoke.sub && <p className={cn("truncate font-mono text-[10.5px]", ok ? "text-muted" : "text-danger")}>{spoke.sub}</p>}
      </div>
      <span className="sr-only">{ok ? "allowed" : "blocked"}</span>
    </div>
  );
}
