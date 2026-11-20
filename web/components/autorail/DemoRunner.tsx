"use client";
import { useState } from "react";
import { Check, Loader2, MonitorPlay, Play, RotateCcw, ShieldAlert, X } from "lucide-react";
import { PresenterMode } from "./PresenterMode";
import type { DemoStep } from "@/lib/autorail/types";
import { useDemoRunner } from "@/hooks/useDemoRunner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TxHashLink } from "@/components/ui/AddressChip";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

const ACTOR: Record<DemoStep["actor"], string> = { lender: "Lender", vendor: "Vendor", lab: "Lab", agents: "Agent" };

/** The 12 scripted demo steps from the README, runnable one by one in mock mode. */
export function DemoRunner() {
  const d = useDemoRunner();
  const [presenting, setPresenting] = useState(false);
  const done = d.steps.filter((s) => s.status === "done").length;
  const busy = !!d.active || d.runningAll;
  return (
    <section aria-labelledby="demo-title" className="card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-line p-5 sm:p-6 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <p className="eyebrow !text-[11.5px]">Demo runner</p>
          <h2 id="demo-title" className="mt-1 text-[17px] font-semibold text-ink">
            12-step scenario <span className="ml-1 font-mono text-[13px] font-normal text-muted">{done}/12 done</span>
          </h2>
          <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-bg-alt sm:w-64">
            <div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${(done / 12) * 100}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<MonitorPlay className="h-3.5 w-3.5" />} onClick={() => setPresenting(true)} disabled={!d.supported || d.isLoading}>
            Present
          </Button>
          <Button size="sm" icon={<Play className="h-3.5 w-3.5" />} onClick={() => d.next && d.runStep(d.next.id)} disabled={!d.next || busy || !d.supported}>
            Run next
          </Button>
          <Button size="sm" variant="secondary" onClick={d.runAll} disabled={!d.next || busy || !d.supported} loading={d.runningAll}>
            Run all
          </Button>
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => d.reset("fresh")} disabled={busy || !d.supported}>
            Reset to step 0
          </Button>
          <Button size="sm" variant="ghost" onClick={() => d.reset("scenario")} disabled={busy || !d.supported}>
            Load scenario
          </Button>
        </div>
      </div>
      {!d.supported && <p className="border-b border-line bg-bg px-6 py-3 text-[13.5px] text-muted">Onchain mode: the agents backend drives these steps. Switch to mock mode to rehearse here.</p>}
      {d.error && <ErrorBanner error={d.error} className="mx-5 mt-4 sm:mx-6" />}
      {d.isLoading ? (
        <div className="p-6">
          <SkeletonRows rows={6} />
        </div>
      ) : (
        <ol className="divide-y divide-line">
          {d.steps.map((s) => {
            const running = d.active?.id === s.id || s.status === "running";
            const isNext = d.next?.id === s.id;
            return (
              <li key={s.id} className={cn("grid grid-cols-[32px_1fr] gap-x-3 gap-y-2 px-5 py-4 sm:grid-cols-[32px_1fr_auto] sm:px-6", isNext && !running && "bg-brand-soft/30", s.status === "failed" && "bg-danger-soft")}>
                <span
                  className={cn(
                    "mt-0.5 grid h-8 w-8 place-items-center rounded-full border font-mono text-[11.5px]",
                    s.status === "done" ? "border-brand bg-brand text-white" : s.status === "failed" ? "border-danger bg-surface text-danger" : running ? "border-brand text-brand" : "border-line bg-surface text-muted",
                  )}
                  aria-hidden
                >
                  {s.status === "done" ? <Check className="h-4 w-4" /> : s.status === "failed" ? <X className="h-4 w-4" /> : running ? <Loader2 className="h-4 w-4 animate-spin" /> : String(s.id).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14.5px] font-medium text-ink">
                      <span className="sr-only">Step {s.id}: </span>
                      {s.title}
                    </p>
                    <Badge tone="outline">{ACTOR[s.actor]}</Badge>
                    {s.expectsRevert && (
                      <Badge tone="danger">
                        <ShieldAlert className="h-3 w-3" aria-hidden /> Should revert
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted">{s.description}</p>
                  <p className="mt-1 font-mono text-[11.5px] text-muted">
                    {s.amount && <span className="text-text">{s.amount} · </span>}proof: {s.proof}
                  </p>
                  {running && d.active && (
                    <p className="mt-1.5 font-mono text-[11.5px] text-brand" role="status">
                      {d.active.stage === "signing" ? "Awaiting signature…" : d.active.stage === "pending" ? "Pending onchain…" : "Working…"}
                    </p>
                  )}
                  {s.result && <p className={cn("mt-1.5 text-[13px]", s.expectsRevert ? "text-danger" : "text-brand")}>{s.result}</p>}
                  {s.error && <p className="mt-1.5 text-[13px] text-danger">{s.error}</p>}
                  {s.txHashes.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                      {s.txHashes.map((h) => (
                        <TxHashLink key={h} hash={h} className="text-[11.5px]" />
                      ))}
                    </div>
                  )}
                </div>
                <div className="col-start-2 sm:col-start-3 sm:row-start-1">
                  <Button size="sm" variant={isNext ? "primary" : "secondary"} onClick={() => d.runStep(s.id)} disabled={!isNext || busy || !d.supported} aria-label={`Run step ${s.id}`}>
                    {s.status === "done" ? "Done" : "Run"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {presenting && <PresenterMode d={d} onClose={() => setPresenting(false)} />}
    </section>
  );
}
