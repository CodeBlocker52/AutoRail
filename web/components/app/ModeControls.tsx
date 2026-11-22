"use client";
import { AlertTriangle, Database, RefreshCw } from "lucide-react";
import { useMode, type Health } from "@/hooks/useMode";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/** Header toggle: Live (Aevum) / Demo data. Persisted in the URL (?mode=demo|live) and localStorage. */
export function ModeToggle({ className }: { className?: string }) {
  const { mode, ready, setMode } = useMode();
  return (
    <div role="radiogroup" aria-label="Data source" className={cn("inline-flex shrink-0 rounded-btn border border-line bg-surface p-0.5", className)}>
      {(
        [
          ["onchain", "Live", "Live (Aevum)"],
          ["mock", "Demo", "Demo data"],
        ] as const
      ).map(([m, short, long]) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          disabled={!ready}
          onClick={() => mode !== m && setMode(m)}
          className={cn("rounded-[6px] px-2.5 py-1 text-[12.5px] font-medium transition-colors", mode === m ? (m === "mock" ? "bg-warning text-white" : "bg-brand text-white") : "text-muted hover:text-ink")}
        >
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{long}</span>
        </button>
      ))}
    </div>
  );
}

/** "Demo data" banner, and the offer to switch when Aevum's RPC isn't answering. */
export function ModeBanners() {
  const { mode, ready, setMode, rpcDown, recheck } = useMode();
  if (!ready) return null;
  if (mode === "mock") {
    return (
      <div role="status" className="mb-4 flex flex-col gap-2 rounded-btn border border-warning/40 bg-[#FBF3E2] px-4 py-3 text-[14px] text-warning sm:flex-row sm:items-center">
        <Database className="h-4 w-4 shrink-0" aria-hidden />
        <p className="flex-1">
          <strong>Demo data.</strong> Everything on this screen is simulated in your browser. Nothing is onchain.
        </p>
        <Button size="sm" variant="secondary" onClick={() => setMode("onchain")}>
          Switch to Live (Aevum)
        </Button>
      </div>
    );
  }
  if (rpcDown) {
    return (
      <div role="alert" className="mb-4 flex flex-col gap-2 rounded-btn border border-danger/30 bg-danger-soft px-4 py-3 text-[14px] text-danger sm:flex-row sm:items-center">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        <p className="flex-1">QDay Aevum&apos;s RPC isn&apos;t answering right now, so live data can&apos;t load.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={recheck}>
            Retry
          </Button>
          <Button size="sm" onClick={() => setMode("mock")}>
            Use demo data instead
          </Button>
        </div>
      </div>
    );
  }
  return null;
}

const DOT: Record<Health["status"] | "demo" | "checking", string> = { ok: "bg-brand", degraded: "bg-warning", down: "bg-danger", demo: "bg-muted", checking: "bg-line" };
const LABEL: Record<Health["status"] | "demo" | "checking", string> = { ok: "All systems normal", degraded: "Degraded", down: "RPC unreachable", demo: "Demo data", checking: "Checking…" };

/** Status dot driven by /api/health (title lists warnings). */
export function StatusDot({ withLabel = false, className }: { withLabel?: boolean; className?: string }) {
  const { mode, ready, health, rpcDown } = useMode();
  const s: keyof typeof DOT = !ready ? "checking" : mode === "mock" ? "demo" : rpcDown ? "down" : (health?.status ?? "checking");
  const title = [LABEL[s], health?.rpc.latestBlock ? `block ${health.rpc.latestBlock.toLocaleString("en-US")}` : null, ...(health?.warnings ?? [])].filter(Boolean).join(" · ");
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={title}>
      <span className={cn("h-2 w-2 rounded-full", DOT[s], s === "ok" && "animate-pulse")} aria-hidden />
      {withLabel ? <span className="text-[12px] text-muted">{LABEL[s]}</span> : <span className="sr-only">{LABEL[s]}</span>}
    </span>
  );
}

/** One-line footer: status, latest block, deployed commits. */
export function StatusFooter() {
  const { mode, health } = useMode();
  return (
    <footer className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-4 font-mono text-[11px] text-muted">
      <StatusDot withLabel />
      {mode === "onchain" && health?.rpc.latestBlock && <span>block {health.rpc.latestBlock.toLocaleString("en-US")}</span>}
      {mode === "onchain" && health && <span>contracts @{health.deploymentCommit.slice(0, 7)}</span>}
      {health?.appCommit && <span>app @{health.appCommit.slice(0, 7)}</span>}
      <a href="/api/health" className="hover:text-brand" target="_blank" rel="noreferrer">
        /api/health
      </a>
    </footer>
  );
}
