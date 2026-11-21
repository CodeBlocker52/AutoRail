"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, ExternalLink, Loader2, Maximize2, RotateCcw, ShieldAlert, X } from "lucide-react";
import type { DemoRunnerState } from "@/hooks/useDemoRunner";
import { explorerTx, TARGET_CHAIN_ID } from "@/lib/chain/aevum";
import { shortHash } from "@/lib/autorail/format";
import { useVault } from "@/hooks/useVault";
import { GridBackdrop } from "@/components/ui/GridBackdrop";
import { LogoMark } from "@/components/ui/Logo";
import { CountUp } from "@/components/ui/CountUp";
import { cn } from "@/lib/cn";

const ACTOR = { lender: "Lender", vendor: "Vendor", lab: "Lab", agents: "Agent" } as const;

/** Full-screen demo view. Keys: → run next step · ← previous step · R reset · Esc exit. */
export function PresenterMode({ d, onClose }: { d: DemoRunnerState; onClose: () => void }) {
  const reduce = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const { data: vault } = useVault();
  // `view` is an index into d.steps (step ids may be "7a", "10b" for onchain runs)
  const nextIdx = d.next ? d.steps.findIndex((s) => s.id === d.next!.id) : -1;
  const [view, setView] = useState<number>(() => (nextIdx >= 0 ? nextIdx : Math.max(0, d.steps.length - 1)));
  const busy = !!d.active || d.runningAll;
  const step = d.steps[view];
  const running = !!step && d.active?.id === step.id;

  const runNext = useCallback(() => {
    if (busy || !d.next || !d.supported) return;
    setView(d.steps.findIndex((s) => s.id === d.next!.id));
    void d.runStep(d.next.id);
  }, [busy, d]);

  const back = useCallback(() => setView((v) => Math.max(0, v - 1)), []);
  const forward = useCallback(() => setView((v) => Math.min(d.steps.length - 1, v + 1)), [d.steps.length]);
  const reset = useCallback(async () => {
    if (busy) return;
    await d.reset("fresh");
    setView(0);
  }, [busy, d]);

  useEffect(() => {
    root.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") {
        e.preventDefault();
        // → runs the next step; if you went back to review, it first catches up.
        if (nextIdx >= 0 && view < nextIdx) forward();
        else runNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        void reset();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [onClose, runNext, back, forward, reset, nextIdx, view]);

  if (typeof document === "undefined" || !step) return null;
  const blocked = step.status === "done" && step.expectsRevert;
  const ok = step.status === "done" && !step.expectsRevert;
  const isNext = d.next?.id === step.id;

  return createPortal(
    <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Demo presenter mode" className="fixed inset-0 z-[115] flex flex-col overflow-y-auto bg-bg outline-none">
      <GridBackdrop />
      {/* top bar */}
      <header className="relative flex items-center gap-4 px-6 py-4 sm:px-10">
        <LogoMark size={30} />
        <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-muted">Autorail · {d.mode === "recorded" ? "recorded run" : d.mode === "live" ? "live run" : "demo"} · chain {TARGET_CHAIN_ID}</p>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen())?.catch?.(() => undefined)}
            className="hidden h-9 items-center gap-1.5 rounded-btn border border-line bg-surface px-3 text-[13px] text-text hover:border-brand-line sm:inline-flex"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Full screen
          </button>
          <button onClick={onClose} className="inline-flex h-9 items-center gap-1.5 rounded-btn border border-line bg-surface px-3 text-[13px] text-text hover:border-brand-line" aria-label="Exit presenter mode (Esc)">
            <X className="h-4 w-4" aria-hidden /> Exit
          </button>
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 pb-10 sm:px-10">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[15px] uppercase tracking-[0.2em] text-brand">
            Step {/^\d+$/.test(step.id) ? step.id.padStart(2, "0") : step.id} <span className="text-muted">· {view + 1} / {d.steps.length}</span>
          </span>
          <span className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[12px] uppercase tracking-[0.12em] text-text">{ACTOR[step.actor]}</span>
          {step.expectsRevert && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger-soft px-3 py-1 font-mono text-[12px] uppercase tracking-[0.12em] text-danger">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Safety check
            </span>
          )}
        </div>
        <h2 className="h-display mt-5 text-[clamp(34px,5vw,64px)] leading-[1.06]">{step.title}</h2>
        <p className="mt-4 max-w-3xl text-[19px] leading-relaxed text-text sm:text-[21px]">{step.description}</p>
        {step.amount && (
          <p className="mt-5 font-mono text-[clamp(22px,3vw,34px)] text-ink">
            {step.amount} <span className="text-[0.55em] text-muted">tUSD8</span>
          </p>
        )}

        {/* result */}
        <motion.div
          key={`${step.id}-${step.status}-${running}`}
          initial={blocked && !reduce ? { boxShadow: "0 0 0 0 rgba(155,44,44,0)" } : false}
          animate={blocked && !reduce ? { boxShadow: ["0 0 0 0 rgba(155,44,44,0.0)", "0 0 0 10px rgba(155,44,44,0.28)", "0 0 0 3px rgba(155,44,44,0.18)", "0 0 0 10px rgba(155,44,44,0.28)", "0 0 0 2px rgba(155,44,44,0.15)"] } : undefined}
          transition={{ duration: 1.4, ease: "easeOut" }}
          role="status"
          aria-live="assertive"
          className={cn(
            "mt-8 rounded-card border-2 p-6 sm:p-7",
            running && "border-brand-line bg-surface",
            blocked && "border-danger bg-danger-soft",
            ok && "border-brand bg-brand-soft/60",
            step.status === "failed" && "border-danger bg-danger-soft",
            step.status === "pending" && !running && "border-dashed border-line bg-surface/70",
          )}
        >
          {running ? (
            <p className="flex items-center gap-3 text-[20px] text-brand">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
              {d.active?.stage === "pending" ? "Pending onchain…" : "Awaiting signature…"}
            </p>
          ) : blocked ? (
            <div>
              <p className="flex items-center gap-3 font-mono text-[14px] uppercase tracking-[0.18em] text-danger">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-danger text-white">
                  <X className="h-4 w-4" aria-hidden />
                </span>
                Reverted onchain · as designed
              </p>
              <p className="mt-3 text-[clamp(20px,2.4vw,28px)] font-medium leading-snug text-danger">{step.result?.replace(/^Reverted onchain: /, "")}</p>
              <TxLinks hashes={step.txHashes} danger />
            </div>
          ) : ok ? (
            <div>
              <p className="flex items-center gap-3 font-mono text-[14px] uppercase tracking-[0.18em] text-brand">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-white">
                  <Check className="h-4 w-4" aria-hidden />
                </span>
                Confirmed
              </p>
              <p className="mt-3 text-[clamp(20px,2.4vw,28px)] font-medium leading-snug text-ink">{step.result}</p>
              <TxLinks hashes={step.txHashes} />
            </div>
          ) : step.status === "failed" ? (
            <p className="text-[20px] text-danger">{step.error}</p>
          ) : (
            <p className="text-[18px] text-muted">
              {isNext ? (
                <>
                  Press <Kbd>→</Kbd> to run this step.
                </>
              ) : (
                `Not run yet. Step ${d.next?.id ?? 1} is next.`
              )}
            </p>
          )}
        </motion.div>

        {/* live numbers */}
        {vault && (
          <dl className="mt-6 grid grid-cols-3 gap-3 text-center sm:max-w-xl">
            {[
              ["Vault assets", vault.totalAssets],
              ["Outstanding", vault.outstanding],
              ["Fees earned", vault.feesEarned],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-btn border border-line bg-surface px-3 py-2.5">
                <dt className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-muted">{k as string}</dt>
                <dd className="mt-1 text-[20px] text-ink">
                  <CountUp value={v as bigint} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </main>

      {/* progress + controls */}
      <footer className="relative border-t border-line bg-surface/80 px-6 py-4 backdrop-blur sm:px-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center">
          <ol className="flex flex-1 items-center gap-1.5" aria-label="Steps">
            {d.steps.map((s, i) => (
              <li key={s.id} className="flex-1">
                <button
                  onClick={() => setView(i)}
                  aria-label={`Step ${s.id}: ${s.title} (${s.status})`}
                  aria-current={i === view ? "step" : undefined}
                  className={cn(
                    "block h-2 w-full rounded-full transition-colors",
                    s.status === "done" ? (s.expectsRevert ? "bg-danger" : "bg-brand") : s.status === "failed" ? "bg-danger/50" : "bg-line",
                    i === view && "ring-2 ring-ink ring-offset-2 ring-offset-surface",
                  )}
                />
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-2">
            <button onClick={back} className="inline-flex h-10 items-center gap-1.5 rounded-btn border border-line bg-surface px-3 text-[13px] hover:border-brand-line" aria-label="Previous step (←)">
              <ArrowLeft className="h-4 w-4" aria-hidden /> <Kbd>←</Kbd>
            </button>
            <button onClick={() => (nextIdx >= 0 && view < nextIdx ? forward() : runNext())} disabled={busy || !d.next} className="inline-flex h-10 items-center gap-1.5 rounded-btn bg-brand px-4 text-[13.5px] font-medium text-white hover:bg-brand-hover disabled:opacity-50" aria-label="Run next step (→)">
              {nextIdx >= 0 && view < nextIdx ? "Next" : "Run step"} <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <button onClick={() => void reset()} disabled={busy} className="inline-flex h-10 items-center gap-1.5 rounded-btn border border-line bg-surface px-3 text-[13px] hover:border-brand-line disabled:opacity-50" aria-label="Reset demo (R)">
              <RotateCcw className="h-4 w-4" aria-hidden /> <Kbd>R</Kbd>
            </button>
          </div>
        </div>
      </footer>
    </div>,
    document.body,
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[12px] text-ink shadow-card">{children}</kbd>;
}

function TxLinks({ hashes, danger }: { hashes: string[]; danger?: boolean }) {
  if (!hashes.length) return null;
  return (
    <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
      {hashes.map((h) => (
        <a key={h} href={explorerTx(h)} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1.5 font-mono text-[15px] underline-offset-4 hover:underline", danger ? "text-danger" : "text-brand")}>
          {shortHash(h)} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">(view on explorer)</span>
        </a>
      ))}
    </p>
  );
}
