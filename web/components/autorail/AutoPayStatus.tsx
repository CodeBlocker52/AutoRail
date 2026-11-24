"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock, Info } from "lucide-react";
import type { Hash, Receivable } from "@/lib/autorail/types";
import { formatAmount } from "@/lib/autorail/format";
import { LAB_AUTO_MAX, OUR_LAB_AGENT_ID } from "@/lib/autorail/ourAgents";
import { useClient, AUTORAIL_KEY } from "@/hooks/useClient";
import { TxHashLink } from "@/components/ui/AddressChip";

type View = { kind: "idle" } | { kind: "waiting"; dueAt: number } | { kind: "paying" } | { kind: "paid"; hash?: Hash } | { kind: "skipped"; message: string } | { kind: "error"; message: string };

/**
 * "Frontier Lab auto-pays": for a Funded invoice addressed to our lab agent, polls /api/lab/settle until the lab has
 * repaid it (≈ 60 s after funding), then links to the waterfall. Live mode only; renders nothing otherwise.
 */
export function AutoPayStatus({ receivable: r, compact = false }: { receivable: Receivable; compact?: boolean }) {
  const client = useClient();
  const qc = useQueryClient();
  const [view, setView] = useState<View>({ kind: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eligible = client.mode === "onchain" && r.buyerAgentId === OUR_LAB_AGENT_ID && r.amount <= LAB_AUTO_MAX;

  useEffect(() => {
    if (!eligible || r.state !== "Funded") return;
    let alive = true;
    let errors = 0;
    const tick = async () => {
      if (!alive) return;
      try {
        const res = await fetch("/api/lab/settle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ receivableId: r.id }) });
        const body = (await res.json()) as { status?: string; retryInSeconds?: number; txHash?: Hash; message?: string; code?: string };
        if (!alive) return;
        if (body.status === "wait") {
          const s = Math.max(3, body.retryInSeconds ?? 10);
          setView({ kind: "waiting", dueAt: Date.now() + s * 1000 });
          timer.current = setTimeout(tick, s * 1000);
        } else if (body.status === "paid" || body.status === "already") {
          setView({ kind: "paid", hash: body.txHash });
          void qc.invalidateQueries({ queryKey: [AUTORAIL_KEY] });
        } else if (body.status === "skipped" || !res.ok) {
          setView({ kind: "skipped", message: body.message ?? "Frontier Lab didn't auto-pay this invoice." });
        }
      } catch {
        errors++;
        if (errors > 4) setView({ kind: "error", message: "Couldn't reach the auto-pay service. A lab wallet can still pay this invoice." });
        else timer.current = setTimeout(tick, 15_000);
      }
    };
    setView({ kind: "paying" });
    void tick();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(clock);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [eligible, r.state, r.id, qc]);

  if (!eligible) return null;
  const box = "flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 text-[13.5px]";
  if (r.state === "Repaid" || view.kind === "paid") {
    return (
      <div className={`${box} border-brand-line bg-brand-soft/50 text-brand`} role="status">
        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          Frontier Lab paid {formatAmount(r.amount)} tUSD8 (gasless EIP-3009): lenders were repaid first and your reputation got a 100.{" "}
          {view.kind === "paid" && view.hash && <TxHashLink hash={view.hash} />}{" "}
          {!compact && (
            <Link href={`/app/invoices/${r.id}`} className="font-medium underline-offset-2 hover:underline">
              View the waterfall →
            </Link>
          )}
        </p>
      </div>
    );
  }
  if (r.state !== "Funded") return null;
  if (view.kind === "skipped" || view.kind === "error") {
    return (
      <div className={`${box} border-warning/40 bg-[#FBF3E2] text-warning`} role="status">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>{view.message}</p>
      </div>
    );
  }
  const secs = view.kind === "waiting" ? Math.max(0, Math.ceil((view.dueAt - now) / 1000)) : null;
  return (
    <div className={`${box} border-line bg-bg text-text`} role="status" aria-live="polite">
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
      <p>{secs !== null && secs > 0 ? `Frontier Lab pays this invoice automatically in about ${secs} s (testnet demo).` : "Frontier Lab is signing the payment (gasless EIP-3009)…"}</p>
    </div>
  );
}
